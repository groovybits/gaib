import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { makeChain } from '@/utils/makechain';
import { pinecone } from '@/utils/pinecone-client';
import {
  PINECONE_INDEX_NAME,
  PINECONE_NAME_SPACE,
  OTHER_PINECONE_NAMESPACES,
} from '@/config/pinecone';
import logger from '@/utils/logger';

async function consoleLog(level: string, ...args: any[]) {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg))
    .join(' ');

  logger.log(level, message);
}

async function getValidNamespace(namespaces: any) {
  const describeIndexStatsQuery = {
    describeIndexStatsRequest: {
      filter: {},
    },
  };

  try {
    const index = pinecone.Index(PINECONE_INDEX_NAME);
    const indexStatsResponse = await index.describeIndexStats(describeIndexStatsQuery);
    const namespaceStats = indexStatsResponse.namespaces;

    if (!namespaceStats) {
      console.log('No namespace stats found');
      return null;
    }

    for (const namespace of namespaces) {
      if (!namespace || namespace.length === 0 || namespace === 'undefined') {
        continue;
      }

      const vectorCount = namespaceStats[namespace]?.vectorCount || 0;

      if (vectorCount > 0) {
        console.log('Found valid namespace:', namespace, 'with', vectorCount, 'vectors');
        const tempVectorStore = await PineconeStore.fromExistingIndex(new OpenAIEmbeddings({}), {
          pineconeIndex: index,
          textKey: 'text',
          namespace,
        });

        return {
          validNamespace: namespace,
          vectorStore: tempVectorStore,
        };
      }
    }
  } catch (error) {
    consoleLog('error', 'Error fetching index statistics from Pinecone:', error);
  }

  console.log('No valid namespace found from:', namespaces);
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { question, selectedPersonality, history } = req.body;

  //only accept post requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    res.end();
    return;
  }

  if (!question) {
    consoleLog('error', 'No question in the request');
    res.status(400).json({ error: 'No question in the request' });
    res.end();
    return;
  }

  // OpenAI recommends replacing newlines with spaces for best results
  let sanitizedQuestion = question.trim().replaceAll('\n', ' ');

  consoleLog('info', "\n===\nPersonality: ", selectedPersonality, "\n===\nHistory: ",
    question, "\n===\nSanitized Question: ", sanitizedQuestion, "\n===\nRequest Body: ",
    req.body, "\n===\n");

  const namespaces = [selectedPersonality.toLowerCase().trim(), PINECONE_NAME_SPACE, ...OTHER_PINECONE_NAMESPACES.split(',')];
  consoleLog('info', 'Namespaces:', namespaces)

  const namespaceResult = await getValidNamespace(namespaces);

  if (!namespaceResult) {
    consoleLog('error', 'No valid namespace found.');
    res.setHeader('Retry-After', '5'); // The value is in seconds
    res.status(503).end();
    return
  }
  consoleLog('info', 'VectorDB Namespace found:', namespaceResult.validNamespace);

  const sendData = (data: string) => {
    res.write(`data: ${data}\n\n`);
  };

  try {
     // Set headers before starting the chain
     res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    sendData(JSON.stringify({ data: '' }));
  
    // Create chain
    const chain = makeChain(namespaceResult.vectorStore, selectedPersonality, (token: string) => {
      sendData(JSON.stringify({ data: token }));
    });
  
    // Ask a question
    let response = await chain.call({
      question: sanitizedQuestion,
      chat_history: history ? [history] : [],
    });

    if (response) {
      sendData(JSON.stringify({ sourceDocs: response.sourceDocuments }));
      consoleLog('info', "\n===\nResponse: \n", response, "\n===\n");
    } else {
      consoleLog('error', 'Error, giving up, No response from GPT for question:', sanitizedQuestion, ' personality:', selectedPersonality);
      res.setHeader('Retry-After', '5'); // The value is in seconds
      res.status(503).end();
      return;
    }
  } catch (error) {
    if (error instanceof Error && error.message) {
      consoleLog('error', 'GPT API error: ', error.message ? error.message : error);
    } else {
      consoleLog('error', 'GPT Unknown error:', error);
    }
    res.setHeader('Retry-After', '5'); // The value is in seconds
    res.status(503).end();
    return;
  }

  sendData('[DONE]');
  res.end();
}
