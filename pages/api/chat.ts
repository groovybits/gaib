import type { NextApiResponse } from 'next';
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
const sendReferences = process.env.SEND_REFERENCES ? Boolean(process.env.SEND_REFERENCES) : false;

function countTokens(textString: string): number {
  let totalTokens = 0;
  
  const encoded = tokenizer.encode(textString);
  totalTokens += encoded.bpe.length;
  
  return totalTokens;
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
      modelName,
      fastModelName,
      tokensCount,
      documentCount,
      episodeCount,
      titleArray,
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
    if (question.startsWith('REPLAY:') || localPersonality === 'Passthrough' || question.startsWith(`!image`)) {
      if (question.startsWith(`!image`)) {
        question.replace(`!image:`, 'REPLAY: ').replace(`!image `, 'REPLAY: ');
        console.log(`ChatAPI: Image Question: ${question}`);
      }
      if (debug) {
        console.log(`ChatAPI Replay: ${question.replace('REPLAY:', '').replace('!image:', '').replace('!image', '')}`);
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      sendData(JSON.stringify({ data: '' }));
      sendData(JSON.stringify({ data: question.replace('REPLAY:', '').replace('!image:','').replace('!image','') }));
      sendData('[DONE]');
      res.end();
      return;
    }

    // Tokens count is the number of tokens to generate
    let requestedTokens = tokensCount;
    let documentsReturned = documentCount;

    // Set the default history
    let maxCount: number = 16000; // max tokens for GPT-3-16k
    if (modelName === 'gpt-3.5-turbo') {
      maxCount = 4000;
    } else if (modelName === 'gpt-4') {
      maxCount = 8000;
    } else if (modelName === 'gpt-3.5-turbo-16k') {
      maxCount = 16000;
    } else if (modelName === 'gpt-4-32k') {
      maxCount = 32000;
    } else {
      maxCount = 4000;
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
      console.log(`ChatAPI: ${isStory ? "Episode" : "Question"} - ${question}`);
      console.log('ChatAPI: Requested tokens:', requestedTokens);
      console.log('ChatAPI: Documents returned:', documentsReturned);
      console.log('ChatAPI: Episode count:', episodeCount);
      console.log('ChatAPI: History:', JSON.stringify(history, null, 2));
      console.log('ChatAPI: Local Personality:', localPersonality);
      console.log('ChatAPI: Custom Prompt:', customPrompt);
      console.log('ChatAPI: Condense Prompt:', condensePrompt);
      console.log('ChatAPI: Command Prompt:', commandPrompt);
      console.log('ChatAPI: Is Story:', isStory ? 'Yes' : 'No');
      console.log('ChatAPI: promptString: ', promptString, ' tokens: ', countTokens(promptString));
      console.log('ChatAPI: condensePromptString: ', condensePromptString, ' tokens: ', countTokens(condensePromptString));
    } else {
      console.log(`ChatAPI: ${modelName}/${fastModelName} ${maxCount}k ${isStory ? "Episode" : "Question"} [${question.slice(0, 20)}...] ${localPersonality} ${isStory ? 'Story' : 'Answer'} ${requestedTokens} tokens ${documentsReturned} documents ${episodeCount} ${isStory ? "episodes" : "answers"}.`);
    }

    // Set headers before starting the chain
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    sendData(JSON.stringify({ data: '' }));

    // Function to create a single chain
    async function createChain(i: number, title: string, namespaceResult: any, localPersonality: any, requestedTokens: number, documentCount: number, userId: string, isStory: boolean) {
      let token_count = 0;
      console.log(`createChain: ${isStory ? "Episode" : "Answer"} #${i + 1} of ${localEpisodeCount} ${isStory ? "episodes" : "answers"}. ${isStory ? "Plotline" : "Question"}: "${title}"`);
      return await makeChain(namespaceResult.vectorStore,
        localPersonality,
        requestedTokens,
        documentCount,
        userId,
        isStory,
        customPrompt,
        condensePrompt,
        commandPrompt,
        modelName,
        fastModelName,
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

    let localEpisodeCount: number = episodeCount;
    console.log(`ChatAPI: Episode Count: ${localEpisodeCount}`);
    if (titleArray.length > 0) {
      for (let i = 0; i < titleArray.length; i++) {
        titles.push(titleArray[i]);
        if (localEpisodeCount > 1) {
          for (let j = 1; j < localEpisodeCount; j++) {
            if (isStory) {
              titles.push(`Continue episode next scene...`);
            } else {
              titles.push(`Next answer iteration...`);
            }
          }
        }
      }
    } else {
      titles.push(question);
      if (localEpisodeCount > 1) {
        for (let i = 1; i < localEpisodeCount; i++) {
          if (isStory && localEpisodeCount === (i + 1)) {
            titles.push(`Last episode of ${localEpisodeCount} episodes, the conclusion.`);
          } else if (isStory) {
            titles.push(`Episode ${i + 1} of ${localEpisodeCount} next episode scene...`);
          } else {
            titles.push(`Answer ${i + 1} of ${localEpisodeCount} next answer iteration...`);
          }
        }
      }
    }
    localEpisodeCount = titles.length;

    if (true || debug) {
      console.log(`ChatAPI: Creating ${localEpisodeCount} titles ${JSON.stringify(titles, null, 2)}.`);
    }

    // Create a chain for each episode
    for (let i = 0; i < localEpisodeCount; i++) {
      try {
        console.log(`ChatAPI: Creating Chain for ${isStory ? "Episode" : "Answer"} #${i + 1} of ${localEpisodeCount} ${isStory ? "episodes" : "answers"}.`);
        let title: string = titles[i];
        const chain = await createChain(i, title, namespaceResult, localPersonality, requestedTokens, documentsReturned, userId, isStory);

        // Add the title to the chat history
        chatHistory = [...chatHistory, { "type": "userMessage", "message": title }];

        // Add the chain to the array
        chains.push(chain);
        titles.push(title);
      } catch (error: any) {
        console.error(`ChatAPI: Error creating chain ${i + 1} of ${localEpisodeCount} ${isStory ? "episodes" : "answers"}: ${error.message}`);
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

      console.info(`=== ChatAPI: Chain #${i} Starting  ${isStory ? "Episode" : "Answer"} #${episodeNumber} of ${localEpisodeCount}  ${isStory ? "episodes" : "answers"}.`);

      let tokenCount = 0;
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
          console.error(`ChatAPI: #${i} Invalid history type: ${hist.type} for ${hist.message}\nActually is: ${JSON.stringify(hist, null, 2)}\n}`);
        }
        // count tokens and break after we hit 2k tokens
        tokenCount = tokenCount + countTokens(hist.message);
        if (tokenCount > (maxCount / 4)) {
          return;
        }
      });
      console.log(`ChatAPI: #${i} Converted History of ${tokenCount} tokens.`);

      if (debug) {
        console.log(`History: ${JSON.stringify(histories, null, 2)}`);
      }

      try {
        let response = await chain?.call({
          question: title,
          chat_history: histories,
        });
        if (!response || !response.text || response.text.length === 0 || response.text.startsWith('Error: ')) {
          console.error(`ChatAPI: #${i} GPT API Error, Not enough tokens available to generate a response!!!`);
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
          if (sendReferences) {
            sendData(JSON.stringify({ data: `\n\nReferences: ${references}\n` }));
          }
          //sendData(JSON.stringify({ sourceDocs: response.sourceDocuments }));
        } else {
          console.error(`ChatAPI: #${i} No reference documents.`);
        }
        console.log(`ChatAPI: #${i} Total Chat Token count: ${total_token_count}`);

        if (debug) {
          console.log(`ChatAPI: #${i} Raw Response: ` + JSON.stringify(response, null, 2) + '\n');
        }
        chatHistory = [...chatHistory, { "type": "apiMessage", "message": response.text }];
      } catch (error: any) {
        if (error.message) {
          console.error(`ChatAPI: #${i} Error generating response for Episode #${episodeNumber}:`, error.message);
          sendData(JSON.stringify({ data: `Error generating response for Episode #${episodeNumber}:\n${error.message}.` }));
        } else {
          console.error(`ChatAPI: #${i} Error generating response for Episode #${episodeNumber}:`, error);
          sendData(JSON.stringify({ data: `Error generating response for Episode #${episodeNumber}:\n${error}.` }));
        }
      }
      sendData(JSON.stringify({ data: "\n\n" }));
    }

    sendData('[DONE]');
    res.end();
  });
}

