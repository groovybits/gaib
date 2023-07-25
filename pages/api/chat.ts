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
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';
import { BaseMessage, HumanMessage, AIMessage } from 'langchain/schema';
import {
  buildPrompt,
  buildCondensePrompt,
} from '@/config/personalityPrompts';

const tokenizer = new GPT3Tokenizer({ type: 'gpt3' });
const debug = process.env.DEBUG ? Boolean(process.env.DEBUG) : false;

function countTokens(textString: string): number {
  let totalTokens = 0;
  
  const encoded = tokenizer.encode(textString);
  totalTokens += encoded.bpe.length;
  
  return totalTokens;
}

async function generateText(userMessage: string, conversationHistory: any[]) {
  const response = await fetch('/api/openai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: userMessage,
      conversationHistory: conversationHistory
    }),
  });

  const data = await response.json();

  if (response.ok) {
    return data;
  } else {
    throw new Error(data.error);
  }
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
      console.error('getValidNamespace: No namespace stats found from Pinecone from [', namespaces, ']');
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
    console.error('Error fetching index statistics from Pinecone:', JSON.stringify(error));
  }

  console.error('No valid namespace found from:', namespaces);
  return null;
}

export default async function handler(req: NextApiRequestWithUser, res: NextApiResponse) {
  await authCheck(req, res, async () => {
    // Set the CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    const {
      question,
      userId,
      localPersonality,
      selectedNamespace,
      isStory,
      customPrompt,
      condensePrompt,
      commandPrompt,
      tokensCount,
      documentCount,
      episodeCount,
      history
    } = req.body;

    // check each input to confirm it is valid and not undefined
    if (question === undefined) {
      console.error('ChatAPI: No question in the request');
      res.status(400).json({ error: 'No question in the request' });
      return;
    }
    if (userId === undefined) {
      console.error('ChatAPI: No userId in the request');
      res.status(400).json({ error: 'No userId in the request' });
      return;
    }
    if (localPersonality === undefined) {
      console.error('ChatAPI: No localPersonality in the request');
      res.status(400).json({ error: 'No localPersonality in the request' });
      return;
    }
    if (isStory === undefined) {
      console.error('ChatAPI: No isStory in the request');
      res.status(400).json({ error: 'No isStory in the request' });
      return;
    }
    if (customPrompt === undefined) {
      console.error('ChatAPI: No customPrompt in the request');
      res.status(400).json({ error: 'No customPrompt in the request' });
      return;
    }
    if (commandPrompt === undefined) {
      console.error('ChatAPI: No commandPrompt in the request');
      res.status(400).json({ error: 'No commandPrompt in the request' });
      return;
    }
    if (condensePrompt === undefined) {
      console.error('ChatAPI: No condensePrompt in the request');
      res.status(400).json({ error: 'No condensePrompt in the request' });
      return;
    }
    if (tokensCount === undefined) {
      console.error('ChatAPI: No tokensCount in the request');
      res.status(400).json({ error: 'No tokensCount in the request' });
      return;
    }
    if (documentCount === undefined) {
      console.error('ChatAPI: No documentCount in the request');
      res.status(400).json({ error: 'No documentCount in the request' });
      return;
    }
    if (episodeCount === undefined) {
      console.error('ChatAPI: No episodeCount in the request');
      res.status(400).json({ error: 'No episodeCount in the request' });
      return;
    }
    if (history === undefined) {
      console.error('ChatAPI: No history in the request');
      res.status(400).json({ error: 'No history in the request' });
      return;
    }
    if (selectedNamespace === undefined) {
      console.error('ChatAPI: No selectedNamespace in the request');
      res.status(400).json({ error: 'No selectedNamespace in the request' });
      return;
    }

    //only accept post requests
    if (req.method !== 'POST') {
      console.error(`ChatAPI: Method ${req.method} not allowed`);
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (!question) {
      console.error('No question in the request');
      res.status(400).json({ error: 'No question in the request' });
      return;
    }

    const sendData = (data: string) => {
      res.write(`data: ${data}\n\n`);
    };

    // check if question string starts with the string "REPLAY:" and if so then just return it using the sendData function and then end the response
    if (question.startsWith('REPLAY:') || localPersonality === 'Passthrough') {
      if (debug) {
        console.log(`ChatAPI Replay: ${question.replace('REPLAY:', '')}`);
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      sendData(JSON.stringify({ data: '' }));
      sendData(JSON.stringify({ data: question.replace('REPLAY:', '') }));
      sendData('[DONE]');
      res.end();
      return;
    }

    // Tokens count is the number of tokens to generate
    let requestedTokens = tokensCount;
    let documentsReturned = documentCount;

    // Set the default history
    let maxCount: number = 16000; // max tokens for GPT-3-16k
    if (process.env.GPT_MAX_TOKENS) {
      maxCount = parseInt(process.env.GPT_MAX_TOKENS);
      if (isNaN(maxCount)) {
        console.error(`ChatAPI: Invalid GPT_MAX_TOKENS value of ${process.env.GPT_MAX_TOKENS}, using default of 16000.`);
        maxCount = 16000;
      }
    }

    if (requestedTokens > maxCount) {
      console.info(`ChatAPI: Requested tokens ${requestedTokens} exceeds max tokens ${maxCount}, limiting to ${maxCount} tokens.`);
      requestedTokens = maxCount;
    }

    // Find a valid namespace
    let namespaces = [selectedNamespace.toLowerCase(), PINECONE_NAME_SPACE, ...OTHER_PINECONE_NAMESPACES.split(',')];
    if (selectedNamespace && selectedNamespace !== 'none') {
      namespaces = [selectedNamespace]; // If a namespace is provided, override the default namespaces
    } else {
      namespaces = []
    }
    const namespaceResult = await getValidNamespace(namespaces);

    if (!namespaceResult) {
      console.error('Pinecone chat: No valid namespace found.');
      res.status(404).end();
      return
    }

    const promptString = (customPrompt == '') ? buildPrompt(localPersonality, isStory) : customPrompt;
    const condensePromptString = (condensePrompt == '') ? buildCondensePrompt(localPersonality, isStory) : condensePrompt;

    let chatHistory = history;
    chatHistory = [{ "type": "systemMessage", "message": promptString }, ...chatHistory, { "type": "userMessage", "message": question }];

    if (debug) {
      console.log('ChatAPI: Pinecone using namespace:', namespaceResult.validNamespace);
      console.log('ChatAPI: Question:', question);
      console.log('ChatAPI: Requested tokens:', requestedTokens);
      console.log('ChatAPI: Documents returned:', documentsReturned);
      console.log('ChatAPI: Episode count:', episodeCount);
      console.log('ChatAPI: History:', JSON.stringify(chatHistory, null, 2));
      console.log('ChatAPI: Local Personality:', localPersonality);
      console.log('ChatAPI: Custom Prompt:', customPrompt);
      console.log('ChatAPI: Condense Prompt:', condensePrompt);
      console.log('ChatAPI: Command Prompt:', commandPrompt);
      console.log('ChatAPI: Is Story:', isStory ? 'Yes' : 'No');
      console.log('ChatAPI: promptString: ', promptString, ' tokens: ', countTokens(promptString));
      console.log('ChatAPI: condensePromptString: ', condensePromptString, ' tokens: ', countTokens(condensePromptString));
    } else {
      console.log(`ChatAPI: Question [${question.slice(0, 20)}...] ${localPersonality} ${isStory ? 'Story' : 'Answer'} ${requestedTokens} tokens ${documentsReturned} documents ${episodeCount} episodes.`);
    }

    // Set headers before starting the chain
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    sendData(JSON.stringify({ data: '' }));

    // Function to create a single chain
    async function createChain(i: number, namespaceResult: any, localPersonality: any, requestedTokens: number, documentCount: number, userId: string, isStory: boolean) {
      let token_count = 0;
      if (debug) {
        console.log(`createChain: ${isStory ? "Episode" : "Answer"} #${i + 1} of ${episodeCount} episodes. Question: "${question}"`);
      }
      return await makeChain(namespaceResult.vectorStore,
        localPersonality,
        requestedTokens,
        documentCount,
        userId,
        isStory,
        customPrompt,
        condensePrompt,
        commandPrompt,
        (token: string) =>
        {
        token_count++;
        if (token_count % 100 === 0) {
          if (debug) {
            console.log(`ChatAPI: createChain ${isStory ? "Episode" : "Answer"} #${i + 1} Chat Token count: ${token_count}`);
          }
        }
        if (typeof token === 'string') {
          sendData(JSON.stringify({ data: token }));
        } else {
          console.error(`ChatAPI: createChain ${isStory ? "Episode" : "Answer"} #${i + 1} Invalid token:`, token ? token : 'null');
        }
      });
    }

    // Create an array to hold the chains
    const chains = [];
    const titles: string[] = [];

    // Create a chain for each episode
    for (let i = 0; i < episodeCount; i++) {
      try {
        console.log(`ChatAPI: Creating Chain for Episode #${i+1} of ${episodeCount} episodes.`);
        const chain = await createChain(i, namespaceResult, localPersonality, requestedTokens, documentsReturned, userId, isStory);
        let title: string = question;

        // Check if it's not the first episode and chatHistory is not empty
        if (i > 0) {
          // Check if it's a story
          if (isStory) {
            // If it's the last episode
            if (episodeCount === (i + 1)) {
              title = `Last episode continuing as episode ${i + 1} of ${episodeCount}.`;
            } else {
              title = `Next episode continuing as episode ${i + 1} of ${episodeCount}`;
            }
          } else {
            // If it's the last episode
            if (episodeCount === (i + 1)) {
              title = `In context of the previous questions and answers, end the conversation with a final answer.`;
            } else {
              title = `Keeping context of the previous questions and answers, continue the conversation with a follow up question to the previous answer.`;
            }
          }
          chatHistory = [...chatHistory, { "type": "userMessage", "message": title }];
        } else {
          // If it's the first episode or single episode
          chatHistory = [...chatHistory, { "type": "userMessage", "message": title }];
        }

        // Add the chain to the array
        chains.push(chain);
        titles.push(title);
      } catch (error: any) {
        console.error(`ChatAPI: Error creating chain ${i + 1} of ${episodeCount} episodes: ${error.message}`);
        sendData(JSON.stringify({ data: 'Error creating chain' }));
        sendData(JSON.stringify({ data: error.message }));
      }
    }

    // Track the total token count
    let total_token_count = 0;

    // Now, run each chain sequentially per episode
    for (let i = 0; i < chains.length; i++) {
      const chain = chains[i];
      let title = titles[i];
      const episodeNumber = i + 1;

      if (debug) {
        console.info(`=== ChatAPI: Starting Episode #${episodeNumber} of ${episodeCount} episodes.`);
      }

      let histories: BaseMessage[] = [];
      chatHistory.forEach((hist: { [x: string]: string; }) => {
        if (hist.type === 'userMessage') {
          let req: BaseMessage = new HumanMessage(hist.message);
          histories.push(req);
        } else if (hist.type === 'apiMessage') {
          let respond: BaseMessage = new AIMessage(hist.message);
          histories.push(respond);
        } else if (hist.type === 'systemMessage') {
          let sysmsg: BaseMessage = new AIMessage(hist.message);
          histories.push(sysmsg);
        } else {
          console.error(`ChatAPI: Invalid history type: ${hist.type} for ${hist.message}\nActually is: ${JSON.stringify(hist, null, 2)}\n}`);
        }
      });
      if (debug) {
        console.log(`ChatAPI: Converted History:\n${JSON.stringify(histories, null, 2)}\n`)
      }

      try {
        let response = await chain?.call({
          question: title,
          chat_history: histories,
        });
        if (!response || !response.text || response.text.length === 0 || response.text.startsWith('Error: ')) {
          console.error('ChatAPI: GPT API Error, Not enough tokens available to generate a response!!!');
          sendData(JSON.stringify({ data: 'Out of tokens, please request more.' }));
          if (response && response.text) {
            sendData(JSON.stringify({ data: response.text }));
          }
        }
        total_token_count = total_token_count + countTokens(response.text) + countTokens(title) + countTokens(promptString) + countTokens(condensePromptString);
        
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
              references = references + `[Reference: ${path.basename(reference.metadata.source)}]\n`;
            }
          }
          sendData(JSON.stringify({ data: `\n\nReferences: ${references}\n` }));
        } else {
          console.error(`ChatAPI: No reference documents.`);
        }
        console.log(`ChatAPI: Total Chat Token count: ${total_token_count}`);

        if (debug) {
          console.log(`ChatAPI: Raw Response: ` + JSON.stringify(response, null, 2) + '\n');
        }
        chatHistory = [...chatHistory, { "type": "apiMessage", "message": response.text }];
      } catch (error: any) {
        if (error.message) {
          console.error(`ChatAPI: Error generating response for Episode #${episodeNumber}:`, error.message);
          sendData(JSON.stringify({ data: `Error generating response for Episode #${episodeNumber}:\n${error.message}.` }));
        } else {
          console.error(`ChatAPI: Error generating response for Episode #${episodeNumber}:`, error);
          sendData(JSON.stringify({ data: `Error generating response for Episode #${episodeNumber}:\n${error}.` }));
        }
      }
    }

    sendData('[DONE]');
    res.end();
  });
}

