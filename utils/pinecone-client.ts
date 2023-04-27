import { PineconeClient } from '@pinecone-database/pinecone';

if (!process.env.PINECONE_ENVIRONMENT || !process.env.PINECONE_API_KEY) {
  throw new Error('Pinecone environment or api key vars missing');
}

async function initPinecone() {
  try {
    const pinecone = new PineconeClient();

    await pinecone.init({
      environment: process.env.PINECONE_ENVIRONMENT!,
      apiKey: process.env.PINECONE_API_KEY!,
    });

    return pinecone;
  } catch (error) {
    if (error instanceof Error && error.message) {
      console.log('Pinecone init error message: [', error.message, ']');
    } else {
      console.log('Pinecone init error: [', error, ']');
    }
    throw new Error('Failed to initialize Pinecone Client');
  }
}

export const pinecone = await initPinecone();
