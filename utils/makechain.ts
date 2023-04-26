import { OpenAIChat } from 'langchain/llms';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { PineconeStore } from 'langchain/vectorstores';
import { CallbackManager } from 'langchain/callbacks';
import { PERSONALITY_PROMPTS, CONDENSE_PROMPT, CONDENSE_PROMPT_QUESTION } from '@/config/personalityPrompts';

const debug = false;

export const makeChain = (
  vectorstore: PineconeStore,
  personality: keyof typeof PERSONALITY_PROMPTS = 'GAIB', // Set a default personality
  onTokenStream?: (token: string) => void,
) => {
  // Condense Prompt depending on a question or a story
  const CONDENSE_PROMPT_STRING = (personality == 'GAIB' || personality == 'Stories') ? CONDENSE_PROMPT : CONDENSE_PROMPT_QUESTION;

  let title_finished = false;
  let accumulatedBodyTokens = '';
  let accumulatedTitleTokens = '';
  let accumulatedTitleTokenCount = 0;
  let accumulatedBodyTokenCount = 0;

  let temperature = (personality == 'GAIB' || personality == 'Stories') ? 0.7 : 0.2;
  let maxTokens = (personality == 'GAIB' || personality == 'Stories') ? 800 : 500;

  const model = new OpenAIChat({
    temperature: temperature,
    maxTokens: maxTokens,
    presencePenalty: 0.1,
    frequencyPenalty: 0.1,
    modelName: 'gpt-3.5-turbo', //change this to gpt-4 if you have access
    streaming: Boolean(onTokenStream),
    callbackManager: onTokenStream
      ? CallbackManager.fromHandlers({
        async handleLLMNewToken(token) {
          if (title_finished == true) {
            accumulatedBodyTokenCount += 1;
            accumulatedBodyTokens += token;
            onTokenStream(token);
          } else {
            accumulatedTitleTokens += token;
            accumulatedTitleTokenCount += 1;
          }
        },
        async handleLLMEnd() {
          if (title_finished === false) {
            title_finished = true;
            console.log("Title: [", accumulatedTitleTokens, "]\n Title Accumulated: ", accumulatedTitleTokenCount, " tokens.\n");
          } else {
            console.log("Body: [", accumulatedBodyTokens, "]\n Body Accumulated: ", accumulatedBodyTokenCount, " tokens.\n");
          }
        },
      })
      : undefined,
  });

  return ConversationalRetrievalQAChain.fromLLM(
    model,
    vectorstore.asRetriever(),
    {
      qaTemplate: PERSONALITY_PROMPTS[personality],
      questionGeneratorTemplate: CONDENSE_PROMPT_STRING,
      returnSourceDocuments: true, //The number of source documents returned is 4 by default    
    },
  );
};
