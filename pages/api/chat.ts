import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { makeChain } from '@/utils/makechain';
import { pinecone } from '@/utils/pinecone-client';
import path from 'path';
import {
  PINECONE_INDEX_NAME,
  PINECONE_NAME_SPACE,
  OTHER_PINECONE_NAMESPACES,
} from '@/config/pinecone';
import GPT3Tokenizer from 'gpt3-tokenizer';

const tokenizer = new GPT3Tokenizer({ type: 'gpt3' });

const TOKEN_PER_DOCUMENT = 300;
const TOKEN_PER_STORY = 2000;
const TOKEN_PER_QUESTION = 500;

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
      totalTokens += storyTokens;
      condensedHistory.unshift([title, summarizedStory]);
      break; // Stop condensing the history
    } else {
      totalTokens += storyTokens;
      condensedHistory.unshift([title, summarizedStory]);
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

  const sendData = (data: string) => {
    res.write(`data: ${data}\n\n`);
  };

  // check if question string starts with the string "REPLAY:" and if so then just return it using the sendData function and then end the response
  if (question.startsWith('REPLAY:')) {
    consoleLog('info', `ChatAPI: REPLAY: ${question}`);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    sendData(JSON.stringify({ data: '' }));
    sendData(JSON.stringify({ data: question }));
    sendData('[DONE]');
    res.end();
    return;
  }

  // Tokens count is the number of tokens to generate
  let requestedTokens = tokensCount;
  let totalTokens = ((requestedTokens <= 0) ? ((isStory) ? TOKEN_PER_STORY : TOKEN_PER_QUESTION) : requestedTokens) * episodeCount;
  let documentsReturned = documentCount;

  // OpenAI recommends replacing newlines with spaces for best results
  let sanitizedQuestion = question.trim().replaceAll('\n', ' ');

  // Set the default history
  let currentQuestion = sanitizedQuestion;
  let chatHistory = history;
  let maxCount: number = 16000; // max tokens for GPT-3-16k
  if (process.env.GPT_MAX_TOKENS) {
    maxCount = parseInt(process.env.GPT_MAX_TOKENS);
    if (isNaN(maxCount)) {
      consoleLog('error', `ChatAPI: Invalid GPT_MAX_TOKENS value of ${process.env.GPT_MAX_TOKENS}, using default of 16000.`);
      maxCount = 16000;
    }
  }

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
    consoleLog('info', `createChain: Episode #${i + 1} of ${episodeCount} episodes. Question: "${currentQuestion}"`);
    return await makeChain(namespaceResult.vectorStore, selectedPersonality, requestedTokens, documentCount, userId, isStory, (token: string) => {
      token_count++;
      if (token_count % 100 === 0) {
        consoleLog('info', `ChatAPI: createChain Episode #${i + 1} Chat Token count: ${token_count}`);
      }
      if (typeof token === 'string') {
        sendData(JSON.stringify({ data: token }));
      } else {
        consoleLog('warning', `ChatAPI: createChain Episode #${i + 1} Invalid token:`, token ? token : 'null');
      }
    });
  }

  // calculate tokens for space to accommodate history
  let spaceLeft = maxCount - (countTokens([sanitizedQuestion]) + (requestedTokens ? requestedTokens : ((isStory) ? TOKEN_PER_STORY : TOKEN_PER_QUESTION)));
  spaceLeft = spaceLeft - (documentCount * TOKEN_PER_DOCUMENT); // tokens per document
  if (spaceLeft < ((isStory) ? TOKEN_PER_STORY : TOKEN_PER_QUESTION)) { // min tokens for history of a question vs story
    consoleLog('warning', `ChatAPI: May not have enough tokens to generate a response, only ${spaceLeft} tokens available.`);
    while (spaceLeft <= ((isStory) ? TOKEN_PER_STORY : TOKEN_PER_QUESTION)) {
      spaceLeft = spaceLeft + TOKEN_PER_DOCUMENT; // add back tokens for each document we remove
      if (documentsReturned > 0) {
        documentsReturned = documentsReturned - 1;
        consoleLog('warning', `ChatAPI: Reducing documents returned from #${documentsReturned + 1} to #${documentsReturned} to fit into token restriction of ${maxCount} tokens allowing ${spaceLeft} more token space.`);
      } else {
        break; // no more documents to reduce
      }
    }
  }

  // Create an array to hold the chains
  const chains = [];
  const titles: string[] = [];

  // Create a chain for each episode
  for (let i = 0; i < episodeCount; i++) {
    consoleLog('info', `ChatAPI: Creating Chain for Episode #${i} of ${episodeCount} episodes.`);
    const chain = await createChain(i, namespaceResult, selectedPersonality, requestedTokens, documentsReturned, userId, isStory);
    let title: string = sanitizedQuestion;
    if (i > 0) { // not the first episode
      if (isStory) {
        if (episodeCount === (i + 1)) {
          title = `keeping context of the original story "${sanitizedQuestion}", end the story arc with a final episode title.`;
        } else {
          title = `keeping context of the original topic "${sanitizedQuestion}", continue the story arc with a follow up episode title that is taken from the episode history.`;
        }
      } else {
        if (episodeCount === (i + 1)) {
          title = `keeping context of the initial question "${sanitizedQuestion}", end the conversation with a final answer.`;
        } else {
          title = `keeping context of the initial question "${sanitizedQuestion}", continue the conversation with a follow up question to the previous answer.`;
        }
      }
    }

    // Add the chain to the array
    chains.push(chain);
    titles.push(title);
  }

  // Track the total token count
  let total_token_count = 0;

  // Now, run each chain sequentially per episode
  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i];
    const title = titles[i];
    const episodeNumber = i + 1;

    // Generate a title for the next episode
    if (i > 0) {
      if (isStory) {
        sendData(JSON.stringify({ data: `\nEpisode #${episodeNumber}.\n` }));
      } else {
        sendData(JSON.stringify({ data: `\nAnswer #${episodeNumber}.\n` }));
      }
    }

    // condense history if needed
    consoleLog('info', `ChatAPI: OpenAI GPT has ${spaceLeft} tokens available for ${chatHistory.length} chat history items costing ${countTokens(chatHistory)} tokens.`);
    const condensedHistory = (countTokens(chatHistory) > spaceLeft) ? condenseHistory(chatHistory, spaceLeft) : chatHistory;
    if (condensedHistory.length != chatHistory.length) {
      consoleLog('info', `ChatAPI: Condensed history from ${chatHistory.length} to ${condensedHistory.length} items condensed to ${countTokens(condensedHistory)} tokens.`);
    }

    try {
      let response = await chain?.call({
        question: title,
        chat_history: condensedHistory ? [condensedHistory] : [],
      });
      if (!response || !response.text || response.text.length === 0 || response.text.startsWith('Error: ')) {
        consoleLog("error", 'ChatAPI: GPT API Error, Not enough tokens available to generate a response!!!');
        sendData(JSON.stringify({ data: 'Out of tokens, please request more.' }));
        if (response && response.text) {
          sendData(JSON.stringify({ data: response.text }));
        }
        break;
      }
      total_token_count = total_token_count + countTokens([response.text]);
      consoleLog('info', `ChatAPI: Finished Episode #${episodeNumber} of ${episodeCount} episodes.`);
      consoleLog('info', `ChatAPI: Question: ${title}`);
      if (chatHistory.length > 0) {
        for (const [question, answer] of chatHistory) {
          let msgNum = chatHistory.indexOf([question, answer]) + 1;
          consoleLog('info', `ChatAPI: History #${msgNum}:\n  Input: "${question}"\n  Output: "${answer.substring(0, 80).replace('\n', ' ').trim()}..."`);
        }
      } else {
        consoleLog('info', `ChatAPI: Chat History is empty [].`);
      }
      consoleLog('info', `ChatAPI: Current Episode #${episodeNumber}: ${response.text.substring(0, 80)}...`);
      if (response.sourceDocuments) {
        // Create a new array with only unique objects
        const uniqueSourceDocuments = response.sourceDocuments.filter((obj: { metadata: { source: any; }; }, index: any, self: { metadata: { source: any; }; }[]) =>
          index === self.findIndex((t: { metadata: { source: any; }; }) => (
            t.metadata && t.metadata.source === obj.metadata.source
          ))
        );

        let references = '';
        for (const reference of uniqueSourceDocuments) {
          if (reference.metadata && reference.metadata.source) {
            consoleLog('info', `ChatAPI: Reference ${path.basename(reference.metadata.source)}.`);
            references = references + `[Reference: ${path.basename(reference.metadata.source)}]\n`;
          }
        }
        sendData(JSON.stringify({ data: `\nReferences: ${references}\n` }));
      } else {
        consoleLog('info', `ChatAPI: No reference documents.`);
      }
      consoleLog('info', `ChatAPI: Total Chat Token count: ${total_token_count}`);
      consoleLog('info', `ChatAPI: Chat History Token count: ${countTokens(chatHistory)}`);

      //consoleLog('debug', `ChatAPI: Raw Response: ` + JSON.stringify(response) + '\n');

      chatHistory = [...chatHistory, [currentQuestion, response.text]];
    } catch (error: any) {
      if (error.message) {
        consoleLog('error', `ChatAPI: Error generating response for Episode #${episodeNumber}:`, error.message);
        sendData(JSON.stringify({ data: `Error generating response for Episode #${episodeNumber}:\n${error.message}.` }));
      } else {
        consoleLog('error', `ChatAPI: Error generating response for Episode #${episodeNumber}:`, error);
        sendData(JSON.stringify({ data: `Error generating response for Episode #${episodeNumber}:\n${error}.` }));
      }
      break;
    }

    // check if we have used the max tokens requested
    if (total_token_count >= totalTokens && episodeCount > 1) {
      consoleLog('info', `ChatAPI: Total token count ${total_token_count} exceeds requested tokens ${totalTokens}.`);
      sendData(JSON.stringify({ data: `ChatAPI: Total token count ${total_token_count} exceeds requested tokens ${totalTokens}.` }));
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

