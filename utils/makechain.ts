import { OpenAI } from 'langchain/llms/openai';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { PineconeStore } from 'langchain/vectorstores';
import { CallbackManager } from 'langchain/callbacks';
import {
  PERSONALITY_PROMPTS,
  CONDENSE_PROMPT_STORY,
  CONDENSE_PROMPT_QUESTION,
  CONDENSE_PROMPT_NEWS_STORY,
  CONDENSE_PROMPT_NEWS_QUESTION,
  STORY_FOOTER,
  QUESTION_FOOTER,
  ANSWER_FOOTER,
  ANALYZE_FOOTER,
  POET_FOOTER,
  SONG_FOOTER,
  NEWS_STORY_FOOTER,
  NEWS_QUESTION_FOOTER,
} from '@/config/personalityPrompts';
import { firestoreAdmin } from '@/config/firebaseAdminInit';
import isUserPremium from '@/config/isUserPremium';
import { BaseLanguageModel } from 'langchain/dist/base_language';

const RETURN_SOURCE_DOCUMENTS = process.env.RETURN_SOURCE_DOCUMENTS === undefined ? true : Boolean(process.env.RETURN_SOURCE_DOCUMENTS);
const modelName = process.env.MODEL_NAME || 'gpt-3.5-turbo-16k';  //change this to gpt-4 if you have access
const fasterModelName = process.env.QUESTION_MODEL_NAME || 'gpt-3.5-turbo-16k';  // faster model for title/question generation
const presence = process.env.PRESENCE_PENALTY !== undefined ? parseFloat(process.env.PRESENCE_PENALTY) : 0.0;
const frequency = process.env.FREQUENCY_PENALTY !== undefined ? parseFloat(process.env.FREQUENCY_PENALTY) : 0.0;
const temperatureStory = process.env.TEMPERATURE_STORY !== undefined ? parseFloat(process.env.TEMPERATURE_STORY) : 0.7;
const temperatureQuestion = process.env.TEMPERATURE_QUESTION !== undefined ? parseFloat(process.env.TEMPERATURE_QUESTION) : 0.0;

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
  onTokenStream?: (token: string) => void,
) => {
  // Condense Prompt depending on a question or a story
  let CONDENSE_PROMPT_STRING = storyMode ? CONDENSE_PROMPT_STORY : CONDENSE_PROMPT_QUESTION;

  // Create the prompt using the personality and the footer depending on a question or a story
  let prompt: string = '';
  if (personality == 'Anime') {
    prompt = `You are an Anime Otaku expert who can answer questions about Anime. ${storyMode ? PERSONALITY_PROMPTS['Anime'] : ''} ${storyMode ? STORY_FOOTER : QUESTION_FOOTER}`;
  } else if (personality == 'Stories') {
    prompt = `You are a professional screenplay writer for TV Espisodes. ${storyMode ? PERSONALITY_PROMPTS['Stories'] : ''} ${storyMode ? STORY_FOOTER : QUESTION_FOOTER}`;
  } else if (personality == 'Poet') {
    prompt = `${PERSONALITY_PROMPTS[personality]} ${storyMode ? STORY_FOOTER : POET_FOOTER}`;
  } else if (personality == 'SongWriter') {
    prompt = `${PERSONALITY_PROMPTS[personality]} ${storyMode ? STORY_FOOTER : SONG_FOOTER}`;
  } else if (personality == 'Analyst') {
    prompt = `${PERSONALITY_PROMPTS[personality]} ${storyMode ? STORY_FOOTER : ANALYZE_FOOTER}`;
  } else if (personality == 'Interviewer') {
    prompt = `${PERSONALITY_PROMPTS[personality]} ${storyMode ? STORY_FOOTER : ANSWER_FOOTER}`;
  } else if (personality == 'NewsReporter' || personality == 'CondensedNews' || personality == 'HappyFunNews') {
    prompt = `${PERSONALITY_PROMPTS[personality]} ${storyMode ? NEWS_STORY_FOOTER : NEWS_QUESTION_FOOTER}`;
    CONDENSE_PROMPT_STRING = storyMode ? CONDENSE_PROMPT_NEWS_STORY : CONDENSE_PROMPT_NEWS_QUESTION;
  } else {
    prompt = `${PERSONALITY_PROMPTS[personality]} ${storyMode ? PERSONALITY_PROMPTS['Stories'] : ''} ${storyMode ? STORY_FOOTER : QUESTION_FOOTER}`;
  }

  console.log("makeChain: Prompt: ", prompt);


  let documentsReturned = documentCount;
  let temperature = (storyMode) ? temperatureStory : temperatureQuestion;
  let logInterval = 100; // Adjust this value to log less or more frequently
  let isPremium = await isUserPremium();
  const isAdmin = await isUserAdmin(userId!);
  const maxTokens = tokensCount;

  async function getUserDetails(userId: string) {
    const userDoc = await firestoreAdmin.collection("users").doc(userId).get();
    const userData = userDoc.data();
    return {
      displayName: userData ? userData.displayName : '',
      email: userData ? userData.email : '',
    };
  }

  async function getUserTokenBalance(userId: string): Promise<number> {
    const userDoc = await firestoreAdmin.collection("users").doc(userId).get();
    const userData = userDoc.data();
    return userData ? userData.tokenBalance : 0;
  }

  async function isUserAdmin(userId: string): Promise<boolean> {
    const userDoc = await firestoreAdmin.collection("users").doc(userId).get();
    const userData = userDoc.data();
    return userData ? userData.isAdmin : false;
  }

  const userTokenBalance = await getUserTokenBalance(userId!);
  if (userTokenBalance <= 0 && !isAdmin) {
    const userDetails = await getUserDetails(userId!);
    console.log(
      `makeChain: ${userId} (${userDetails.displayName}, 
        ${userDetails.email}) Premium:${isPremium} does not have enough tokens to run this model, only ${userTokenBalance} left.`
    );
    // Send signal that user does not have enough tokens to run this model
    throw new Error(`Not enough tokens, only ${userTokenBalance} left.`);
  }

  // Function to create a model with specific parameters
  async function createModel(params: any, userId: string, userTokenBalance: number, isAdmin: boolean) {
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

            if (accumulatedBodyTokenCount % logInterval === 0) {
              console.log(
                `makeChain: ${personality} Body Accumulated: ${accumulatedBodyTokenCount} tokens and ${accumulatedBodyTokens.length} characters.`
              );
            }
            // Deduct tokens based on the tokenCount
            if (!isAdmin) {
              const newTokenBalance = userTokenBalance - tokenCount;
              if (newTokenBalance >= 0) {
                await firestoreAdmin.collection("users").doc(userId).update({ tokenBalance: newTokenBalance });
              } else {
                console.log(`makeChain: ${userId} does not have enough tokens to run this model [only ${userTokenBalance} of ${tokenCount} needed].`);
                // Send signal that user does not have enough tokens to run this model
                throw new Error(`makeChain: ${userId} does not have enough tokens to run this model [only ${userTokenBalance} of ${tokenCount} needed].`);
              }
            }
          },
          async handleLLMStart(llm, prompts, runId, parentRunId, extraParams) {
            console.log(`makeChain: llm=${llm} ${personality} Starting using ${JSON.stringify(prompts)} with runId ${runId} and parentRunId ${parentRunId} with extraParams ${JSON.stringify(extraParams)}...`);
          },
          async handleLLMEnd() {
            console.log('makeChain:', personality, "Body Accumulated: ", accumulatedBodyTokenCount, " tokens and ", accumulatedBodyTokens.length, " characters.");
            console.log('makeChain:', personality, "Stories Body: [\n", accumulatedBodyTokens.trim(), "\n]");
            console.log(`makeChain: Deducting ${tokenCount} tokens from ${userId}...`);
            console.log(`makeChain: ${userId} has ${userTokenBalance} tokens left.`);
          },
          async handleLLMError(error) {
            console.error("makeChain: Error in createModel: ", error);
            throw new Error("makeChain: Error in createModel: " + error);
          }
        })
        : undefined,
    }, userId, userTokenBalance, isAdmin);
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
    console.log(`makeChain: Retrieving ${documentsReturned} documents from the document store using [${CONDENSE_PROMPT_STRING}].`)

    if (documentsReturned > 0) {
      chain = ConversationalRetrievalQAChain.fromLLM(model,
        vectorstore.asRetriever(documentsReturned), // get more source documents, override default of 4
        {
          qaTemplate: prompt,
          questionGeneratorTemplate: CONDENSE_PROMPT_STRING,
          returnSourceDocuments: RETURN_SOURCE_DOCUMENTS,
          ...options,
        },
      );
    } else {
      chain = ConversationalRetrievalQAChain.fromLLM(model,
        vectorstore.asRetriever(1),
        {
          qaTemplate: prompt,
          questionGeneratorTemplate: CONDENSE_PROMPT_STRING,
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
