import { OpenAI } from 'langchain/llms/openai';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { PineconeStore } from 'langchain/vectorstores';
import { CallbackManager } from 'langchain/callbacks';
import { PERSONALITY_PROMPTS, CONDENSE_PROMPT, CONDENSE_PROMPT_QUESTION } from '@/config/personalityPrompts';
import firestoreAdmin from '@/config/firebaseAdminInit';
import isUserPremium from '@/config/isUserPremium';

export const makeChain = async (
  vectorstore: PineconeStore,
  personality: keyof typeof PERSONALITY_PROMPTS,
  userId: string,
  onTokenStream?: (token: string) => void,
) => {
  // Condense Prompt depending on a question or a story
  const CONDENSE_PROMPT_STRING = (personality == 'GAIB' || personality == 'Stories') ? CONDENSE_PROMPT : CONDENSE_PROMPT_QUESTION;

  let title_finished = false;
  let accumulatedBodyTokens = '';
  let accumulatedTitleTokens = '';
  let accumulatedTitleTokenCount = 0;
  let accumulatedBodyTokenCount = 0;
  let documentsReturned = 8;

  let temperature = (personality == 'GAIB' || personality == 'Stories' || personality == 'Poet') ? 0.9 : 0.5;
  let maxTokens = (personality == 'GAIB' || personality == 'Stories' || personality == 'Poet' || personality == 'VideoEngineer' || personality == 'Engineer' || personality == 'Coder') ? 1000 : 500;
  let logInterval = 33; // Adjust this value to log less or more frequently
  let tokenCount = 0;  
  let isPremium = await isUserPremium();
  const isAdmin = await isUserAdmin(userId!);

  // Adjust maxTokens and documentsReturned based on premium status
  if (!isPremium && !isAdmin) {
    maxTokens = maxTokens * 0.25;
    documentsReturned = 1;
  }

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
  if (userTokenBalance < maxTokens && !isAdmin) {
    const userDetails = await getUserDetails(userId!);
    console.log(
      `${userId} (${userDetails.displayName}, 
        ${userDetails.email}) Premium:${isPremium} does not have enough tokens to run this model [only ${userTokenBalance} of ${maxTokens} needed].`
    );
    // Send signal that user does not have enough tokens to run this model
    return null;
  }

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
            // Deduct tokens based on the tokenCount
            if (!isAdmin) {
              const newTokenBalance = userTokenBalance - tokenCount;
              await firestoreAdmin.collection("users").doc(userId).update({ tokenBalance: newTokenBalance });
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
            console.log(`Deducting ${tokenCount} tokens from ${userId}...`);
          }
        },
      })
      : undefined,
  });

  return ConversationalRetrievalQAChain.fromLLM(
    model,
    vectorstore.asRetriever(documentsReturned), // get more source documents, override default of 4
    {
      qaTemplate: PERSONALITY_PROMPTS[personality],
      questionGeneratorTemplate: CONDENSE_PROMPT_STRING,
      returnSourceDocuments: true,   
    },
  );
};
