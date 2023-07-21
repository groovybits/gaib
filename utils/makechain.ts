import { OpenAI } from 'langchain/llms/openai';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { PineconeStore } from 'langchain/vectorstores';
import { CallbackManager } from 'langchain/callbacks';
import {
  PERSONALITY_PROMPTS,
  buildPrompt,
  buildCondensePrompt,
} from '@/config/personalityPrompts';
import isUserPremium from '@/config/isUserPremium';
import { BaseLanguageModel } from 'langchain/dist/base_language';

const RETURN_SOURCE_DOCUMENTS = process.env.RETURN_SOURCE_DOCUMENTS === undefined ? true : Boolean(process.env.RETURN_SOURCE_DOCUMENTS);
const modelName = process.env.MODEL_NAME || 'gpt-3.5-turbo-16k';  //change this to gpt-4 if you have access
const fasterModelName = process.env.QUESTION_MODEL_NAME || 'gpt-3.5-turbo-16k';  // faster model for title/question generation
const presence = process.env.PRESENCE_PENALTY !== undefined ? parseFloat(process.env.PRESENCE_PENALTY) : 0.0;
const frequency = process.env.FREQUENCY_PENALTY !== undefined ? parseFloat(process.env.FREQUENCY_PENALTY) : 0.0;
const temperatureStory = process.env.TEMPERATURE_STORY !== undefined ? parseFloat(process.env.TEMPERATURE_STORY) : 0.7;
const temperatureQuestion = process.env.TEMPERATURE_QUESTION !== undefined ? parseFloat(process.env.TEMPERATURE_QUESTION) : 0.0;
const debug = process.env.DEBUG ? Boolean(process.env.DEBUG) : false;
const authEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTH == 'true' ? true : false;

let firebaseFunctions: any;
if (authEnabled) {
  firebaseFunctions = await import('@/config/firebaseAdminInit');
}

const fasterModel = new OpenAI({
  modelName: fasterModelName,
});

export const makeChain = async (
  vectorstore: PineconeStore,
  personality: keyof typeof PERSONALITY_PROMPTS,
  tokensCount: number,
  documentCount: number,
  userId: string,
  storyMode: boolean,
  customPrompt: string,
  condensePrompt: string,
  onTokenStream?: (token: string) => void,
) => {
  // Condense Prompt depending on a question or a story
  let condensePromptString = (condensePrompt != '') ? condensePrompt : buildCondensePrompt(personality, storyMode);

  // Create the prompt using the personality and the footer depending on a question or a story
  let prompt: string = '';
  if (customPrompt != '') {
    prompt = `${customPrompt}`;
  } else {
    prompt = buildPrompt(personality, storyMode);
  }

  let documentsReturned = documentCount;
  let temperature = (storyMode) ? temperatureStory : temperatureQuestion;
  let logInterval = 100; // Adjust this value to log less or more frequently
  let isAdmin = false;
  if (authEnabled) {
    isAdmin = await firebaseFunctions.isUserAdmin(userId!);
  }
  const maxTokens = tokensCount;

  let userTokenBalance = 0;
  if (authEnabled) {
    userTokenBalance = await firebaseFunctions.getUserTokenBalance(userId!);
  }
  if (userTokenBalance <= 0 && !isAdmin && authEnabled) {
    const userDetails = await firebaseFunctions.getUserDetails(userId!);
    const isPremium = await isUserPremium();
    console.log(
      `makeChain: ${userId} (${userDetails.displayName}, 
        ${userDetails.email}) Premium:${isPremium} does not have enough tokens to run this model, only ${userTokenBalance} left.`
    );
    // Send signal that user does not have enough tokens to run this model
    throw new Error(`Not enough tokens, only ${userTokenBalance} left.`);
  }

  // Function to create a model with specific parameters
  async function createModel(params: any) {
    let model: BaseLanguageModel;
    try {
      model = new OpenAI(params);
    } catch (error: any) {
      console.error(error);
      throw error;
    }

    return model;
  }

  let tokenCount = 0;
  let accumulatedBodyTokens = '';
  let accumulatedBodyTokenCount = 0;

  // Create the model
  let model: BaseLanguageModel;
  try {
    model = await createModel({
      temperature: temperature,
      presencePenalty: presence,
      maxTokens: (maxTokens > 0) ? maxTokens : null,
      frequencyPenalty: frequency,
      modelName: modelName,
      streaming: Boolean(onTokenStream),
      callbackManager: onTokenStream
        ? CallbackManager.fromHandlers({
          async handleLLMNewToken(token) {
            tokenCount += 1;

            accumulatedBodyTokenCount += 1;
            accumulatedBodyTokens += token;
            onTokenStream(token);

            if (accumulatedBodyTokenCount % logInterval === 0 && debug) {
              console.log(
                `makeChain: ${personality} Body Accumulated: ${accumulatedBodyTokenCount} tokens and ${accumulatedBodyTokens.length} characters.`
              );
            }
            // Deduct tokens based on the tokenCount
            if (!isAdmin && authEnabled) {
              const newTokenBalance = userTokenBalance - tokenCount;
              if (newTokenBalance >= 0) {
                try {
                  if (firebaseFunctions.firestoreAdmin && authEnabled) {
                    await firebaseFunctions.updateTokenBalance(userId, newTokenBalance);
                  } else {
                    // Firebase Admin SDK is not initialized. Anonymous mode
                  }
                } catch (error: any) {
                  if (error.code === 'app/no-app') {
                    // Firebase Admin SDK is not initialized. Anonymous mode
                  } else {
                    // Some other error occurred
                    throw error;
                  }
                }
              } else {
                console.log(`makeChain: ${userId} does not have enough tokens to run this model [only ${userTokenBalance} of ${tokenCount} needed].`);
                // Send signal that user does not have enough tokens to run this model
                throw new Error(`makeChain: ${userId} does not have enough tokens to run this model [only ${userTokenBalance} of ${tokenCount} needed].`);
              }
            }
          },
          async handleLLMStart(llm, prompts, runId, parentRunId, extraParams) {
            if (debug) {
              console.log(`makeChain: Start of LLM for llm=${JSON.stringify(llm, null, 2)} \n prompts: ${JSON.stringify(prompts, null, 2)} \n runId: ${runId} parentRunId: ${parentRunId} \n extraParams: ${JSON.stringify(extraParams, null, 2)}`);
            }
          },
          async handleLLMEnd() {
            if (debug) {
              console.log(`makeChain: End of LLM for ${userId} using ${tokenCount}/${accumulatedBodyTokens.length} tokens/characters of ${userTokenBalance} \n with output: ${accumulatedBodyTokens.trim().replace('\n', ' ')}.`);
            }
          },
          async handleLLMError(error) {
            console.error("makeChain: Error in createModel: ", error);
            throw new Error("makeChain: Error in createModel: " + error);
          }
        })
        : undefined,
    });
  } catch (error: any) {
    console.error("makeChain: Error in createModel: ", error);
    throw new Error("makeChain: Error in createModel: " + error);
  }

  const options = {
    questionGeneratorChainOptions: {
      llm: fasterModel,
      maxTokens: (maxTokens > 0) ? maxTokens : null,
      temperature: temperature,
      presencePenalty: presence,
      frequencyPenalty: frequency,
      topP: 1.0,
      bestOf: 1,
      returnFullOutput: true,
      returnMetadata: false,
      returnPrompt: false,
      returnQuestion: true,
      returnAnswer: false,
    },
  }

  let chain;
  try {
    if (documentsReturned > 0) {
      chain = ConversationalRetrievalQAChain.fromLLM(model,
        vectorstore.asRetriever(documentsReturned), // get more source documents, override default of 4
        {
          qaTemplate: prompt,
          questionGeneratorTemplate: condensePromptString,
          returnSourceDocuments: RETURN_SOURCE_DOCUMENTS,
          ...options,
        },
      );
    } else {
      chain = ConversationalRetrievalQAChain.fromLLM(model,
        vectorstore.asRetriever(1),
        {
          qaTemplate: prompt,
          questionGeneratorTemplate: condensePromptString,
          returnSourceDocuments: false,
          ...options,
        },
      );
    }
  } catch (error: any) {
    console.error("makeChain: Error in ConversationalRetrievalQAChain.fromLLM: ", error);
    throw new Error("makeChain: Error in ConversationalRetrievalQAChain.fromLLM: " + error);
  }

  return chain;
};
