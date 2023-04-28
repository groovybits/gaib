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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      console.log('getValidNamespace: No namespace stats found from Pinecone from [', namespaces, ']');
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
  // Set the CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  const { question, selectedPersonality, history } = req.body;

  //only accept post requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!question) {
    consoleLog('error', 'No question in the request');
    res.status(400).json({ error: 'No question in the request' });
    return;
  }

  // OpenAI recommends replacing newlines with spaces for best results
  let sanitizedQuestion = question.trim().replaceAll('\n', ' ');
  // Find a valid namespace
  const namespaces = [selectedPersonality.toLowerCase(), PINECONE_NAME_SPACE, ...OTHER_PINECONE_NAMESPACES.split(',')];
  const namespaceResult = await getValidNamespace(namespaces);

  if (!namespaceResult) {
    consoleLog('error', 'Pinecone chat: No valid namespace found.');
    res.setHeader('Retry-After', '5'); // The value is in seconds
    res.status(503).end();
    return
  }

  consoleLog('info', "\n===\nPersonality:", selectedPersonality, "\nQuestion:",
    sanitizedQuestion, "Namespaces:", namespaces, "\nNamespace:",
    namespaceResult.validNamespace, "\nHistory:", history, "\n===\n")

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

    const maxRetries = 100;
    const baseDelay = 333; // .333 second
    let retries = 0;
    let response;

    while (retries < maxRetries) {
      try {
        response = await chain.call({
          question: sanitizedQuestion,
          chat_history: history ? [history] : [],
        });

    if (response) {
      break; // Exit the loop if a response is received
    }
  } catch (error) {
    consoleLog("error", `Attempt ${retries + 1}: GPT API error`, error);
    retries++;
    await delay(baseDelay * retries); // Wait for a delay before retrying
  }
}


    if (response) {
      consoleLog('info', "\n===\nResponse: \n", response.text, "\n===\nSource Documents:", response.sourceDocuments, "\n===\n");
    } else {
      consoleLog('error', 'Error, giving up, No response from GPT for question:', sanitizedQuestion, ' personality:', selectedPersonality);
      return;
    }
  } catch (error) {
    if (error instanceof Error && error.message) {
      consoleLog('error', 'GPT API error: ', error.message ? error.message : error);
    } else {
      consoleLog('error', 'GPT Unknown error:', error);
    }
    return;
  }

  sendData('[DONE]');
  res.end();
}
