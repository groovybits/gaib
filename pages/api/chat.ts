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
import GPT3Tokenizer from 'gpt3-tokenizer';

const tokenizer = new GPT3Tokenizer({ type: 'gpt3' });

function countTokens(textArray: string[]): number {
  let totalTokens = 0;
  for (const text of textArray) {
    if (typeof text !== 'string') {
      // text is an array of strings
      totalTokens += countTokens(text);
      continue;
    }
    const encoded = tokenizer.encode(text);
    totalTokens += encoded.bpe.length;
  }
  return totalTokens;
}

function truncateStory(story: string, maxTokens: number): string {
  // Split the story into words
  const words = story.split(' ');

  // If the story is already shorter than maxTokens, return it as is
  if (words.length <= maxTokens) {
    return story;
  }

  // Otherwise, return the first maxTokens words joined together
  return words.slice(0, maxTokens).join(' ') + '...';  // Add '...' to indicate that the story has been truncated
}

function condenseHistory(history: [string, string][], maxTokens: number): [string, string][] {
  let condensedHistory: [string, string][] = [];
  let totalTokens = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const [title, story] = history[i];
    const titleTokens = countTokens([title]);

    if ((totalTokens + titleTokens) > maxTokens) {
      break;
    }

    totalTokens += titleTokens;

    let summarizedStory = summarize(story);
    let storyTokens = countTokens([summarizedStory]);

    if ((totalTokens + storyTokens) > maxTokens) {
      const remainingTokens = maxTokens - totalTokens;
      summarizedStory = truncateStory(summarizedStory, remainingTokens);
      storyTokens = countTokens([summarizedStory]);
    }

    if ((totalTokens + storyTokens) <= maxTokens) {
      totalTokens += storyTokens;
      condensedHistory.unshift([title, summarizedStory]);
    } else {
      break;
    }
  }

  return condensedHistory;
}

async function consoleLog(level: string, ...args: any[]) {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg))
    .join(' ');

  console.log(message);
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
  const { question, userId, selectedPersonality, selectedNamespace, isStory, tokensCount, documentCount, episodeCount, history } = req.body;


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

  let requestedTokens = tokensCount;
  if (tokensCount === 0) {
    requestedTokens = (isStory) ? 2000 : 800;
  }

  // Check if the history + question is too long
  let maxCount = 3000; // max tokens for GPT-3, overhead for document store context space
  // calcuate tokens, avoid less than 0
  let spaceLeft = maxCount - countTokens([question]) - requestedTokens;

  console.log('OpenAI GPT maxCount tokens available for history:', spaceLeft, 'history length:', countTokens(history));
  const condensedHistory = (countTokens(history) > spaceLeft) ? condenseHistory(history, spaceLeft) : history;
  console.log('OpenAI GPT History total history token count:', countTokens(condensedHistory));

  // OpenAI recommends replacing newlines with spaces for best results
  let sanitizedQuestion = question.trim().replaceAll('\n', ' ');
  // Find a valid namespace
  let namespaces = [selectedPersonality.toLowerCase(), PINECONE_NAME_SPACE, ...OTHER_PINECONE_NAMESPACES.split(',')];
  if (selectedNamespace && selectedNamespace !== 'none') {
    namespaces = [selectedNamespace]; // If a namespace is provided, override the default namespaces
  } else {
    namespaces = []
  }
  const namespaceResult = await getValidNamespace(namespaces);

  if (!namespaceResult) {
    consoleLog('error', 'Pinecone chat: No valid namespace found.');
    res.setHeader('Retry-After', '5'); // The value is in seconds
    res.status(503).end();
    return
  }

  consoleLog('info', "\n===\nPersonality:", selectedPersonality, "\n===\nTokenCount:", tokensCount, "\nQuestion:",
    sanitizedQuestion, "Namespaces:", namespaces, "\nNamespace:",
    namespaceResult.validNamespace, "\nHistory:", history, "\n===\n")

  const sendData = (data: string) => {
    res.write(`data: ${data}\n\n`);
  };

  // Set headers before starting the chain
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  sendData(JSON.stringify({ data: '' }));

  // iterate the number of episodes requested
  let total_token_count = 0;
  for (let i = 0; i < episodeCount; i++) {
    if (i > 0) {
      // next episode after first initial reponse
      sanitizedQuestion = 'Next episode';
    }
    console.log('Episode:', i);
    // Create chain
    let token_count = 0;
    const chain = await makeChain(namespaceResult.vectorStore, selectedPersonality, tokensCount, documentCount, userId, isStory, (token: string) => {
      token_count++;
      total_token_count++;
      if (token_count % 100 === 0) {
        console.log('Chat Token count:', token_count);
      }
      if (typeof token === 'string') {
        sendData(JSON.stringify({ data: token }));
      } else {
        consoleLog('error', 'Invalid token:', token ? token : 'null');
      }
    });

    let response = await chain?.call({
      question: sanitizedQuestion,
      chat_history: history ? [history] : [],
    });
    if (!response) {
      consoleLog("error", 'GPT API error, not enough tokens left to generate a response.');
      sendData('[OUT_OF_TOKENS]');
      res.end();
      return;
    }
    consoleLog('info', "\n===\nResponse: \n", response.text, "\n===\nSource Documents:", response.sourceDocuments, "\n===\n");
    consoleLog('info', 'Total Chat Token count:', total_token_count);
    consoleLog('info', 'Chat Token count:', countTokens([response.text]));
    consoleLog('info', 'Episode Number:', i);
  }

  sendData('[DONE]');
  res.end();
}

// TODO: Implement this function with NLP or GPT-3 summarization
function summarize(story: string):string {
  return story;
}

