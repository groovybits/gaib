import { OpenAIChat } from 'langchain/llms';
import { LLMChain, ChatVectorDBQAChain, loadQAChain } from 'langchain/chains';
import { PineconeStore } from 'langchain/vectorstores';
import { PromptTemplate } from 'langchain/prompts';
import { CallbackManager } from 'langchain/callbacks';
import { CONDENSE_PROMPT } from '@/config/pinecone';
import { PERSONALITY_PROMPTS } from '@/config/personalityPrompts';

const CONDENSE_PROMPT_TEMPLATE =
  PromptTemplate.fromTemplate(CONDENSE_PROMPT);

let accumulatedTokens = '';

export const makeChain = (
  vectorstore: PineconeStore,
  personality: keyof typeof PERSONALITY_PROMPTS = 'GAIB', // Set a default personality
  onTokenStream?: (token: string) => void,
) => {
  const QA_PROMPT = PromptTemplate.fromTemplate(PERSONALITY_PROMPTS[personality]);
  const questionGenerator = new LLMChain({
    llm: new OpenAIChat({ temperature: 0.3, presencePenalty: 0, frequencyPenalty: 0, maxTokens: 200, modelName: 'gpt-3.5-turbo' }),
    prompt: CONDENSE_PROMPT_TEMPLATE,
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
    returnSourceDocuments: true,
    k: 3, //number of source documents to return
  });
};
