/**
 * Change the namespace to the namespace on Pinecone you'd like to store your embeddings.
 */

if (!process.env.PINECONE_INDEX_NAME) {
  throw new Error('Missing Pinecone index name in .env file');
}

if (!process.env.PINECONE_NAME_SPACE) {
  throw new Error('Missing Pinecone name space in .env file');
}

if (!process.env.PINECONE_PROMPT) {
  throw new Error('Missing Pinecone prompt in .env file');
}

if (!process.env.PINECONE_CONDENSE_PROMPT) {
  throw new Error('Missing Pinecone condense prompt in .env file');
}

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? '';

const PINECONE_NAME_SPACE = process.env.PINECONE_NAME_SPACE ?? '';;

const PINECONE_CONDENSE_PROMPT = process.env.PINECONE_CONDENSE_PROMPT ?? '';

const PINECONE_PROMPT = process.env.PINECONE_PROMPT ?? '';

export { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE, PINECONE_PROMPT, PINECONE_CONDENSE_PROMPT };
