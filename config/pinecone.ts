/**
 * Change the namespace to the namespace on Pinecone you'd like to store your embeddings.
 */

if (!process.env.PINECONE_INDEX_NAME) {
  throw new Error('Missing Pinecone index name in .env file');
}

if (!process.env.PINECONE_NAME_SPACE) {
  throw new Error('Missing Pinecone name space in .env file');
} else {
  console.log('Pinecone using namespace: ', process.env.PINECONE_NAME_SPACE);
}

if (!process.env.GOOGLE_TRANSLATE_API_KEY) {
  throw new Error('Missing Google Text Translation API Key in .env file');
}

const OTHER_PINECONE_NAMESPACES = process.env.OTHER_PINECONE_NAMESPACES ?? '';

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? '';

const PINECONE_NAME_SPACE = process.env.PINECONE_NAME_SPACE ?? '';;

const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY ?? '';

export { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE, GOOGLE_TRANSLATE_API_KEY, OTHER_PINECONE_NAMESPACES };
