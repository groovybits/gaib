import { OpenAIChat } from 'langchain/llms';
import { LLMChain, ChatVectorDBQAChain, loadQAChain } from 'langchain/chains';
import { PineconeStore } from 'langchain/vectorstores';
import { PromptTemplate } from 'langchain/prompts';
import { CallbackManager } from 'langchain/callbacks';
import { PERSONALITY_PROMPTS, CONDENSE_PROMPT, CONDENSE_PROMPT_QUESTION } from '@/config/personalityPrompts';

const debug = false;

export const makeChain = (
  vectorstore: PineconeStore,
  personality: keyof typeof PERSONALITY_PROMPTS = 'GAIB', // Set a default personality
  onTokenStream?: (token: string) => void,
) => {

  // Condense Prompt depending on a question or a story
  const CONDENSE_PROMPT_TEMPLATE = (personality == 'GAIB' || personality == 'Stories') ?  PromptTemplate.fromTemplate(CONDENSE_PROMPT) : PromptTemplate.fromTemplate(CONDENSE_PROMPT_QUESTION);

  let accumulatedTokens = '';

  const QA_PROMPT = PromptTemplate.fromTemplate(PERSONALITY_PROMPTS[personality]);
  if (debug) {
    console.log("\n===\nQA_PROMPT: ", QA_PROMPT);
    console.log("\n===\nCONDENSE_PROMPT_TEMPLATE: ", CONDENSE_PROMPT_TEMPLATE);
  }

  const questionGenerator = new LLMChain({
    llm: new OpenAIChat({ temperature: 0.3, presencePenalty: 0, frequencyPenalty: 0, maxTokens: 200, modelName: 'gpt-3.5-turbo' }),
    prompt: CONDENSE_PROMPT_TEMPLATE,
  });
  if (debug) {
    console.log("\n===\nQuestionGenerator: ", questionGenerator);
  }

  const docChain = loadQAChain(
    new OpenAIChat({
      temperature: 0.7,
      maxTokens: 800,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      modelName: 'gpt-3.5-turbo', //change this to older versions (e.g. gpt-3.5-turbo) if you don't have access to gpt-4
      streaming: Boolean(onTokenStream),
      callbackManager: onTokenStream
        ? CallbackManager.fromHandlers({
          async handleLLMNewToken(token) {
            accumulatedTokens += token;
            onTokenStream(token);
          },
          async handleLLMEnd() {
            console.log("accumulatedTokens: [", accumulatedTokens, "] length: ", accumulatedTokens.length, " tokens\n");
          },
        })
        : undefined,
    }),
    { prompt: QA_PROMPT },
  );
  if (debug) {
    console.log("\n===\nDocChain: ", docChain);
  }

  if (!docChain) {
    throw new Error('Failure with GPT API, please try again later.');
  }

  return new ChatVectorDBQAChain({
    vectorstore,
    combineDocumentsChain: docChain,
    questionGeneratorChain: questionGenerator,
    returnSourceDocuments: true,
    k: 8, //number of source documents to return
  });
};
