import { OpenAI } from 'langchain/llms/openai';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { PineconeStore } from 'langchain/vectorstores';
import { CallbackManager } from 'langchain/callbacks';
import {
  PERSONALITY_PROMPTS,
  CONDENSE_PROMPT_STORY,
  CONDENSE_PROMPT_QUESTION,
  STORY_FOOTER,
  QUESTION_FOOTER,
  ANSWER_FOOTER,
  ANALYZE_FOOTER,
  POET_FOOTER,
  SONG_FOOTER
} from '@/config/personalityPrompts';
import firestoreAdmin from '@/config/firebaseAdminInit';
import isUserPremium from '@/config/isUserPremium';
import { BaseLanguageModel } from 'langchain/dist/base_language';
import GPT3Tokenizer from 'gpt3-tokenizer';
import { on } from 'events';
const tokenizer = new GPT3Tokenizer({ type: 'gpt3' });

const RETURN_SOURCE_DOCUMENTS = process.env.RETURN_SOURCE_DOCUMENTS === 'false' ? false : true;

function countTokens(textArray: string[]): number {
  let totalTokens = 0;
  for (const text of textArray) {
    if (typeof text !== 'string') {
      // text is an array of strings
      totalTokens += countTokens(text);
      continue;
    }
    const encoded = tokenizer.encode(text);
    totalTokens += encoded.bpe.length;
  }
  return totalTokens;
}

// Function to clean a document
function cleanDocument(document: string): string {
  // Add your cleaning logic here
  return document.replace(/[^a-zA-Z0-9\s]/g, "");
}

// Function to retry with a smaller context
async function retryWithSmallerContext(model: BaseLanguageModel, vectorstore: PineconeStore, documentsReturned: number, smallerPrompt: string, CONDENSE_PROMPT_STRING: string) {
  try {
    return ConversationalRetrievalQAChain.fromLLM(
      model,
      vectorstore.asRetriever(documentsReturned),
      {
        qaTemplate: smallerPrompt,
        questionGeneratorTemplate: CONDENSE_PROMPT_STRING,
        returnSourceDocuments: true,
      },
    );
  } catch (error: any) {
    console.log("Retry Error in ConversationalRetrievalQAChain.fromLLM: ", error);
    throw error;
  }
}

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
  const CONDENSE_PROMPT_STRING = storyMode ? CONDENSE_PROMPT_STORY : CONDENSE_PROMPT_QUESTION;

  // Create the prompt using the personality and the footer depending on a question or a story
  let prompt: string = '';
  if (personality == 'Anime') {
    prompt = `You are an Anime Otaku expert. ${storyMode ? PERSONALITY_PROMPTS['Anime'] : ''} ${storyMode ? STORY_FOOTER : QUESTION_FOOTER}`;
  } else if (personality == 'Stories') {
    prompt = `You are a professional screenplay writer for TV Espisodes. ${storyMode ? PERSONALITY_PROMPTS['Stories'] : ''} ${storyMode ? STORY_FOOTER : QUESTION_FOOTER}`;
  } else if (personality == 'Poet') {
    prompt = `${PERSONALITY_PROMPTS[personality]} ${storyMode ? PERSONALITY_PROMPTS['Stories'] : ''} ${storyMode ? STORY_FOOTER : POET_FOOTER}`;
  } else if (personality == 'SongWriter') {
    prompt = `${PERSONALITY_PROMPTS[personality]} ${storyMode ? PERSONALITY_PROMPTS['Stories'] : ''} ${storyMode ? STORY_FOOTER : SONG_FOOTER}`;
  } else if (personality == 'Analyst') {
    prompt = `${PERSONALITY_PROMPTS[personality]} ${storyMode ? PERSONALITY_PROMPTS['Stories'] : ''} ${storyMode ? STORY_FOOTER : ANALYZE_FOOTER}`;
  } else if (personality == 'Interviewer') {
    prompt = `${PERSONALITY_PROMPTS[personality]} ${storyMode ? PERSONALITY_PROMPTS['Stories'] : ''} ${storyMode ? STORY_FOOTER : ANSWER_FOOTER}`;
  } else {
    prompt = `${PERSONALITY_PROMPTS[personality]} ${storyMode ? PERSONALITY_PROMPTS['Stories'] : ''} ${storyMode ? STORY_FOOTER : QUESTION_FOOTER}`;
  }

  console.log("makeChain: Prompt: ", prompt);

  // take the 
  let title_finished = false;
  let accumulatedBodyTokens = '';
  let accumulatedTitleTokens = '';
  let accumulatedTitleTokenCount = 0;
  let accumulatedBodyTokenCount = 0;
  let documentsReturned = documentCount;

  let temperature = (storyMode) ? 0.7 : 0.1;
  let logInterval = 100; // Adjust this value to log less or more frequently
  let tokenCount = 0;
  let isPremium = await isUserPremium();
  const isAdmin = await isUserAdmin(userId!);
  const maxTokens = tokensCount;

  // Clean the documents returned from the document store
  //vectorstore = vectorstore.map(cleanDocument);

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
      if (error.response && error.response.data && error.response.data.error && error.response.data.error.code === 'context_length_exceeded') {
        console.warn("makeChain: Too much context. Retrying with a smaller context...");
        // Retry with a smaller context
        if (params.maxTokens) {
          params.maxTokens = params.maxTokens / 1.5; // Use a smaller context
        }
        try {
          model = new OpenAI(params);
        } catch (error: any) {
          console.error(error);
          throw error;
        }
      } else {
        console.error(error);
        throw error;
      }
    }

    return model;
  }

  // Create the model
  let model : BaseLanguageModel;
  try {
    model = await createModel({
      temperature: temperature,
      presencePenalty: 0.2,
      maxTokens: (maxTokens > 0) ? maxTokens : null,
      frequencyPenalty: 0.3,
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
            } else {
              accumulatedTitleTokens += token;
              accumulatedTitleTokenCount += 1;
              onTokenStream(token);

              if (accumulatedTitleTokenCount % logInterval === 0) {
                console.log(
                  `makeChain: ${personality} Title Accumulated: ${accumulatedTitleTokenCount} tokens.`
                );
              }
            }
          },
          async handleLLMEnd() {
            if (title_finished === false) {
              title_finished = true;
              console.log('makeChain:', personality, "Stories Title: [\n", accumulatedTitleTokens.trim(), "\n] Title Accumulated: ", accumulatedTitleTokenCount, " tokens.");
              onTokenStream("\n\n## Episode Begins:\n\n"); 
            } else {
              console.log('makeChain:', personality, "Body Accumulated: ", accumulatedBodyTokenCount, " tokens and ", accumulatedBodyTokens.length, " characters.");
              console.log('makeChain:', personality, "Stories Body: [\n", accumulatedBodyTokens.trim(), "\n]");
              console.log(`makeChain: Deducting ${tokenCount} tokens from ${userId}...`);
            }
          },
        })
        : undefined,
    }, userId, userTokenBalance, isAdmin);
  } catch (error: any) {
    console.error("makeChain: Error in createModel: ", error);
    throw new Error("makeChain: Error in createModel: " + error);
  }

  let chain;
  try {
    console.log(`makeChain: Retrieving ${documentsReturned} documents from the document store using [${CONDENSE_PROMPT_STRING}].`)
    chain = ConversationalRetrievalQAChain.fromLLM(model,
      vectorstore.asRetriever(documentsReturned), // get more source documents, override default of 4
      {
        qaTemplate: prompt,
        questionGeneratorTemplate: CONDENSE_PROMPT_STRING,
        returnSourceDocuments: RETURN_SOURCE_DOCUMENTS,
      },
    );
  } catch (error: any) {
    if (error.response && error.response.data && error.response.data.error && error.response.data.error.code === 'context_length_exceeded') {
      // The context length was exceeded. Retry with a smaller context...
      console.warn("makeChain: Context length exceeded. Retrying with a smaller context...");
      const smallerPrompt = prompt.slice(-1000); // Retry #1 with a smaller context
      chain = await retryWithSmallerContext(model, vectorstore, 1, smallerPrompt, CONDENSE_PROMPT_STRING);
    } else {
      // Some other error occurred. Handle it as appropriate for your application...
      console.error("makeChain: Error in ConversationalRetrievalQAChain.fromLLM: ", error);
      throw new Error("makeChain: Error in ConversationalRetrievalQAChain.fromLLM: " + error);
    }
  }

  return chain;
};
