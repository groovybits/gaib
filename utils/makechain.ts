import { OpenAIChat } from 'langchain/llms';
import { LLMChain, ChatVectorDBQAChain, loadQAChain } from 'langchain/chains';
import { PineconeStore } from 'langchain/vectorstores';
import { PromptTemplate } from 'langchain/prompts';
import { CallbackManager } from 'langchain/callbacks';
import { PINECONE_PROMPT, PINECONE_CONDENSE_PROMPT } from '@/config/pinecone';

const CONDENSE_PROMPT =
  PromptTemplate.fromTemplate(PINECONE_CONDENSE_PROMPT + `

Story History:
{chat_history}
=========
Follow Up Input: {question}
=========
Standalone title:`);

const QA_PROMPT = PromptTemplate.fromTemplate(
  PINECONE_PROMPT + `

=========
Context: {context}
=========
Story Direction: {question}
Story Title and Screen Play format with cues in Markdown format:`,
);

let accumulatedTokens = '';

export const makeChain = (
  vectorstore: PineconeStore,
  onTokenStream?: (token: string) => void,
) => {
  const questionGenerator = new LLMChain({
    llm: new OpenAIChat({ temperature: 0.3, presencePenalty: 0, frequencyPenalty: 0, maxTokens: 200, modelName: 'gpt-3.5-turbo' }),
    prompt: CONDENSE_PROMPT,
  });
  const docChain = loadQAChain(
    new OpenAIChat({
      temperature: 0.8,
      maxTokens: 800,
      presencePenalty: 0.5,
      frequencyPenalty: 0.5,
      modelName: 'gpt-3.5-turbo', //change this to older versions (e.g. gpt-3.5-turbo) if you don't have access to gpt-4
      streaming: Boolean(onTokenStream),
      callbackManager: onTokenStream
        ? CallbackManager.fromHandlers({
            async handleLLMNewToken(token) {
              accumulatedTokens += token;
              onTokenStream(token);
            },
            async handleLLMEnd() {
              console.log('accumulatedTokens: ', accumulatedTokens)
            },
          })
        : undefined,
    }),
    { prompt: QA_PROMPT },
  );

  if (! docChain ) {
    throw new Error('Failure with GPT API, please try again later.');
  }

  return new ChatVectorDBQAChain({
    vectorstore,
    combineDocumentsChain: docChain,
    questionGeneratorChain: questionGenerator,
    returnSourceDocuments: false,
    k: 3, //number of source documents to return
  });
};
