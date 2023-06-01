import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { makeChain } from '@/utils/makechain';
import { pinecone } from '@/utils/pinecone-client';
import {
  PERSONALITY_PROMPTS,
    CONDENSE_PROMPT,
    CONDENSE_PROMPT_QUESTION,
    STORY_FOOTER,
    QUESTION_FOOTER,
    ANSWER_FOOTER,
    ANALYZE_FOOTER,
    POET_FOOTER,
    SONG_FOOTER
} from '@/config/personalityPrompts';
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

  // Tokens count is the number of tokens to generate
  let requestedTokens = tokensCount;
  if (tokensCount === 0) {
    requestedTokens = (isStory) ? 2000  : 800;
  }
  let totalTokens = requestedTokens * episodeCount;

  // OpenAI recommends replacing newlines with spaces for best results
  let sanitizedQuestion = question.trim().replaceAll('\n', ' ');

  // Set the default history
  let currentQuestion = sanitizedQuestion;
  let chatHistory = history;
  let maxCount = 3000; // max tokens for GPT-3, overhead for document store context space

  if (requestedTokens > maxCount) {
    consoleLog('info', `ChatAPI: Requested tokens ${requestedTokens} exceeds max tokens ${maxCount}, limiting to ${maxCount} tokens.`);
    requestedTokens = maxCount;
  }

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

  consoleLog('info', 'ChatAPI: Pinecone using namespace:', namespaceResult.validNamespace);

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

  // Function to create a single chain
  async function createChain(i: number, namespaceResult: any, selectedPersonality: any, requestedTokens: number, documentCount: number, userId: string, isStory: boolean) {
    let token_count = 0;
    consoleLog('info', `createChain: Episode #${i + 1} of ${episodeCount} episodes. Question: ${currentQuestion}}`);
    return await makeChain(namespaceResult.vectorStore, selectedPersonality, requestedTokens, documentCount, userId, isStory, (token: string) => {
      token_count++;
      if (token_count % 100 === 0) {
        consoleLog('info', `ChatAPI: createChain Episode #${i+ 1} Chat Token count: ${token_count}`);
      }
      if (typeof token === 'string') {
        sendData(JSON.stringify({ data: token }));
      } else {
        consoleLog('error', `ChatAPI: createChain Episode #${i + 1} Invalid token:`, token ? token : 'null');
      }
    });
  }

  // Create an array to hold the chains
  const chains = [];

  // Create a chain for each episode
  for (let i = 0; i < episodeCount; i++) {
    consoleLog('info', `ChatAPI: Creating Chain for Episode #${i} of ${episodeCount} episodes.`);
    const chain = await createChain(i, namespaceResult, selectedPersonality, requestedTokens, documentCount, userId, isStory);
    // Add the chain to the array
    chains.push(chain);
  }

  // Track the total token count
  let total_token_count = 0;

  // Now, run each chain sequentially per episode
  let title = sanitizedQuestion;
  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i];
    const episodeNumber = i + 1;

    // Generate a title for the next episode
    if (i > 0) {
      if (isStory) {
        sendData(JSON.stringify({ data: `\nEnd of Episode #${episodeNumber - 1} Title: ${title}` }));
        title = "summarize the chat history using it as the next episodes title and plot based on the original topic of: " + sanitizedQuestion;
        sendData(JSON.stringify({ data: `Next Episode #${episodeNumber} Title: ${title}` }));
      } else {
        sendData(JSON.stringify({ data: `\nEnd of Answer #${episodeNumber - 1} Question: ${title}` }));
        title = "summarize the chat history using it to for a follow up question to the previous answers for the original question of: " + sanitizedQuestion;
        sendData(JSON.stringify({ data: `Next Answer #${episodeNumber} Question: ${title}` }));
      }
    } else {
      // For the first episode, use the original question as the title
      title = sanitizedQuestion;
    }

    // calcuate tokens for space to accomodate history
    let spaceLeft = maxCount - countTokens([currentQuestion]) - requestedTokens;
    if (spaceLeft < 0) {
      spaceLeft = 0;
    }

    // condense history if needed
    consoleLog('info', `ChatAPI: OpenAI GPT maxCount tokens available for history: ${spaceLeft} history length: ${countTokens(chatHistory)}`);
    const condensedHistory = (countTokens(chatHistory) > spaceLeft) ? condenseHistory(chatHistory, spaceLeft) : chatHistory;
    if (condensedHistory.length != chatHistory.length) {
      consoleLog('info', `ChatAPI: Condensed history from ${chatHistory.length} to ${condensedHistory.length} items.`);
    }

    try {
      let response = await chain?.call({
        question: title,
        chat_history: condensedHistory ? [condensedHistory] : [],
      });
      if (!response) {
        consoleLog("error", 'ChatAPI: GPT API Error, Not enough tokens available to generate a response!!!');
        sendData('[OUT_OF_TOKENS]');
        res.end();
        return;
      }
      total_token_count = total_token_count + countTokens([response.text]);
      consoleLog('info', `ChatAPI: Finished Episode #${episodeNumber} of ${episodeCount} episodes.`);
      consoleLog('info', `ChatAPI: Question: ${ title }`);
      consoleLog('info', `ChatAPI: Chat History:`, chatHistory);
      consoleLog('info', `ChatAPI: Current Episode #${episodeNumber}: ${response.text}`);
      consoleLog('info', `ChatAPI: Source Documents:`, response.sourceDocuments);
      consoleLog('info', `ChatAPI: Total Chat Token count: ${total_token_count}`);
      consoleLog('info', `ChatAPI: Chat History Token count: ${countTokens(chatHistory)}`);

      chatHistory = [...chatHistory, [currentQuestion, response.text]];
    } catch (error: any) {
      consoleLog('error', 'ChatAPI: Error generating response:', error);
      sendData('[ERROR]');
      res.end();
      return;
    }

    // check if we have used the max tokens requested
    if (total_token_count >= totalTokens) {
      consoleLog('info', `ChatAPI: Total token count ${total_token_count} exceeds requested tokens ${totalTokens}.`);
      break;
    }
  }

  sendData('[DONE]');
  res.end();
}

// TODO: Implement this function with NLP or GPT-3 summarization
function summarize(story: string): string {
  return story;
}

