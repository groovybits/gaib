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

const PINECONE_CONDENSE_PROMPT = process.env.PINECONE_CONDENSE_PROMPT ?? 'Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.';

const PINECONE_PROMPT = process.env.PINECONE_PROMPT ?? 'You are GAIB the Groovy AI Bot! Maintain your character as GAIB and role play conversations between people from different texts when requested. Provide wisdom and guidance based on the teachings and knowledge contained in these sources. Embark on this enlightening journey with those who seek your counsel!';

export { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE, PINECONE_PROMPT, PINECONE_CONDENSE_PROMPT };
