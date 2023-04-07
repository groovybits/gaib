import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIEmbeddings } from 'langchain/embeddings';
import { PineconeStore } from 'langchain/vectorstores';
import { makeChain } from '@/utils/makechain';
import { pinecone } from '@/utils/pinecone-client';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';


const MAX_INPUT_LENGTH = 4096;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // Set the initial retry delay in milliseconds

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { question, history } = req.body;

  console.log('-- START SESSION ---');
  console.log('Original Question: ', question);

  if (!question) {
    return res.status(400).json({ message: 'No question in the request' });
  }
  // OpenAI recommends replacing newlines with spaces for best results
  let sanitizedQuestion = question.trim().replaceAll('\n', ' ');

  // Truncate the input if it exceeds the maximum length
  if (sanitizedQuestion.length > MAX_INPUT_LENGTH) {
    console.log(`Question exceeds maximum length of ${MAX_INPUT_LENGTH} characters, truncating...`)
    sanitizedQuestion = sanitizedQuestion.substring(0, MAX_INPUT_LENGTH);
  }
  console.log('Sanitized Question: ', sanitizedQuestion);

  const index = pinecone.Index(PINECONE_INDEX_NAME);

  let vectorStore;
  try {
    /* create vectorstore */
    vectorStore = await PineconeStore.fromExistingIndex(new OpenAIEmbeddings({}), {
      pineconeIndex: index,
      textKey: 'text',
      namespace: PINECONE_NAME_SPACE,
    });
  } catch (error) {
    console.error('Error creating vector store:', error);
    return res.status(500).json({ message: 'Internal server error VS001.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const sendData = (data: string) => {
    res.write(`data: ${data}\n\n`);
  };

  sendData(JSON.stringify({ data: '' }));

  // Create chain
  const chain = makeChain(vectorStore, (token: string) => {
    sendData(JSON.stringify({ data: token }));
  });

  let response;
  let retries = 0;
  let success = false;

  while (!success && retries < MAX_RETRIES) {
    try {
      // Ask a question
      response = await chain.call({
        question: sanitizedQuestion,
        chat_history: history || [],
      });

      if (!response) {
        console.error('No response from GPT');
        retries++;
        continue;
      }

      console.log('History: ', history ? history : '');
      console.log('Reponse: ', response.text);
      success = true;
    } catch (error) {
      if (error instanceof Error && error.message) {
        console.error('API error: ', error.message ? error.message : error);
      } else {
        console.error('Unknown error:', error);
      }
      retries++;

      if (retries < MAX_RETRIES) {
        const retryDelay = INITIAL_RETRY_DELAY * Math.pow(2, retries - 1);
        console.log(`Retrying in ${retryDelay} ms...`);
        await sleep(retryDelay);
      } else {
        console.log('Could not contact GPT after multiple retries, giving up. Please try again later.');
        sendData(JSON.stringify({ error: 'Could not contact GPT after multiple retries, giving up. Please try again later.' }));
        break;
      }
    }
  }
  console.log('-- END SESSION ---');

  sendData('[DONE]');
  res.end();
}
