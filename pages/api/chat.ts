import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIEmbeddings } from 'langchain/embeddings';
import { PineconeStore } from 'langchain/vectorstores';
import { makeChain } from '@/utils/makechain';
import { pinecone } from '@/utils/pinecone-client';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';

const MAX_INPUT_LENGTH = 4096; // Set the maximum input length allowed
const MAX_RETRIES = 10; // Set the maximum number of retries

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { question, history } = req.body;

  if (!question) {
    return res.status(400).json({ message: 'No question in the request' });
  }
  // OpenAI recommends replacing newlines with spaces for best results
  let sanitizedQuestion = question.trim().replaceAll('\n', ' ');

  // Truncate the input if it exceeds the maximum length
  if (sanitizedQuestion.length > MAX_INPUT_LENGTH) {
    sanitizedQuestion = sanitizedQuestion.substring(0, MAX_INPUT_LENGTH);
  }

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
    return res.status(500).json({ message: 'Internal server error while creating vector store.' });
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

      console.log('response', response);
      sendData(JSON.stringify({ sourceDocs: response.sourceDocuments }));
      success = true;
    } catch (error) {
      console.error('API error:', error.response ? error.response.data : error);
      retries++;
      if (retries >= MAX_RETRIES) {
        sendData(JSON.stringify({ error: 'An error occurred while processing the request. Maximum retries reached.' }));
      }
    }
  }

  sendData('[DONE]');
  res.end();
}
