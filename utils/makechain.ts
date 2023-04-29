import { OpenAI } from 'langchain/llms/openai';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { PineconeStore } from 'langchain/vectorstores';
import { CallbackManager } from 'langchain/callbacks';
import { PERSONALITY_PROMPTS, CONDENSE_PROMPT, CONDENSE_PROMPT_QUESTION } from '@/config/personalityPrompts';


export const makeChain = (
  vectorstore: PineconeStore,
  personality: keyof typeof PERSONALITY_PROMPTS,
  onTokenStream?: (token: string) => void,
) => {
  // Condense Prompt depending on a question or a story
  const CONDENSE_PROMPT_STRING = (personality == 'GAIB' || personality == 'Stories') ? CONDENSE_PROMPT : CONDENSE_PROMPT_QUESTION;

  let title_finished = false;
  let accumulatedBodyTokens = '';
  let accumulatedTitleTokens = '';
  let accumulatedTitleTokenCount = 0;
  let accumulatedBodyTokenCount = 0;

  let temperature = (personality == 'GAIB' || personality == 'Stories' || personality == 'Poet') ? 0.9 : 0.5;
  let maxTokens = (personality == 'GAIB' || personality == 'Stories' || personality == 'Poet' || personality == 'VideoEngineer' || personality == 'Engineer' || personality == 'Coder') ? 800 : 200;
  const logInterval = 33; // Adjust this value to log less or more frequently
  let tokenCount = 0;  

  const model = new OpenAI({
    temperature: temperature,
    maxTokens: maxTokens,
    presencePenalty: 0.1,
    frequencyPenalty: 0.1,
    modelName: 'gpt-3.5-turbo', //change this to gpt-4 if you have access
    streaming: Boolean(onTokenStream),
    callbackManager: onTokenStream
      ? CallbackManager.fromHandlers({
        async handleLLMNewToken(token) {
          tokenCount += 1;

          if (title_finished == true) {
            accumulatedBodyTokenCount += 1;
            accumulatedBodyTokens += token;
            onTokenStream(token);

            if (accumulatedBodyTokenCount % logInterval === 0) {
              console.log(
                `${personality} Body Accumulated: ${accumulatedBodyTokenCount} tokens and ${accumulatedBodyTokens.length} characters.`
              );
            }
          } else {
            accumulatedTitleTokens += token;
            accumulatedTitleTokenCount += 1;

            if (accumulatedTitleTokenCount % logInterval === 0) {
              console.log(
                `${personality} Title Accumulated: ${accumulatedTitleTokenCount} tokens.`
              );
            }
          }
        },
        async handleLLMEnd() {
          if (title_finished === false) {
            title_finished = true;
            console.log(personality, "Stories Title: [", accumulatedTitleTokens.trim(), "]\nTitle Accumulated: ", accumulatedTitleTokenCount, " tokens.");
          } else {
            console.log(personality, "Body Accumulated: ", accumulatedBodyTokenCount, " tokens and ", accumulatedBodyTokens.length, " characters.");
          }
        },
      })
      : undefined,
  });

  return ConversationalRetrievalQAChain.fromLLM(
    model,
    vectorstore.asRetriever(8), // get more source documents, override default of 4
    {
      qaTemplate: PERSONALITY_PROMPTS[personality],
      questionGeneratorTemplate: CONDENSE_PROMPT_STRING,
      returnSourceDocuments: true,   
    },
  );
};
