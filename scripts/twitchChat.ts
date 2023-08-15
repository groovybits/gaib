import tmi from 'tmi.js';
import admin from 'firebase-admin';
import { PERSONALITY_PROMPTS } from '@/config/personalityPrompts';
import { Episode } from '@/types/story';
import FuzzySet from 'fuzzyset.js';
import { Document } from "langchain/document";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import { pinecone } from '@/utils/pinecone-client';

const USER_INDEX_NAME = process.env.PINECONE_INDEX_NAME ? process.env.PINECONE_INDEX_NAME : '';
const storeUserMessages = process.env.STORE_USER_MESSAGES === 'true' ? true : false;

const index = pinecone.Index(USER_INDEX_NAME);
const namespace = 'chathistory';
const embeddings = new OpenAIEmbeddings();

// Function to initialize the user index
async function initializeUserIndex(docs: Document[], namespace: string) {
  await PineconeStore.fromDocuments(docs, embeddings, {
    pineconeIndex: index,
    namespace: namespace,
    textKey: 'text',
  });
}

// Function to store a user message
async function storeUserMessage(username: string, message: string, namespace: string) {
  const doc = new Document({
    pageContent: message,
    metadata: { username: username, timestamp: Date.now(), type: 'message', namespace: namespace },
  });
  await initializeUserIndex([doc], namespace);
}

// Function to search related conversations
async function searchRelatedConversations(query: string, k: number = 3): Promise<any[]> {
  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex: index,
    textKey: 'text',
    namespace,
  });
  return await vectorStore.similaritySearch(query, k);
}

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
});

const db = admin.database();

// Get the channel name from the command line arguments
const channelName = process.argv[2];
const oAuthToken = process.env.TWITCH_OAUTH_TOKEN ? process.env.TWITCH_OAUTH_TOKEN : '';
const messageLimit: number = process.env.TWITCH_MESSAGE_LIMIT ? parseInt(process.env.TWITCH_MESSAGE_LIMIT) : 500;
const chatHistorySize: number = process.env.TWITCH_CHAT_HISTORY_SIZE ? parseInt(process.env.TWITCH_CHAT_HISTORY_SIZE) : 3;
const llm = 'gpt-3.5-turbo-16k';  //'gpt-4';
const maxTokens = 100;
const temperature = 0.3;

const answerInChat = process.env.TWITCH_ANSWER_IN_CHAT ? process.env.TWITCH_ANSWER_IN_CHAT === 'true' : false;

const openApiKey: string = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY : '';
if (!openApiKey) {
  console.error('No OpenAI API Key provided!!!');
  process.exit(1);
}

let lastMessageArray: any[] = [];
const processedMessageIds: { [id: string]: boolean } = {};
const personalityPrompt: string = "You're the personality requested by the chat message with '<personality> ...' that can answer questions or create episodes / stories. " +
  "Type !personalities to view available personalities, !image <image description > ` to generate an image, " +
  "and`!help` to get detailed instructions. When asked to generate a story or episode, include the word episode and the personality asked for if any as the first word." +
  "Always communicate with respect and as the personality GOD who is all knowing and all seeing.";

const helpMessage: string = `
Help: - Ask me how to generate anime or general anime questions.

Use the role as the first word in your message to specify the personality you want to use.
For example, if you want to use the personality god, start your message with 'god ...'.

Commands:
  !help - Display this help message.
  !image <prompt> - Generate an image based on prompt.
  !personalities - Display available personalities.

Example:
 god what should I wear today?
`;

if (!channelName) {
  console.log('Usage: node twitchChat.js <channelName>');
  process.exit(1);
}

if (!oAuthToken) {
  console.log('TWITCH_OAUTH_TOKEN environment variable not set');
  process.exit(1);
}

console.log(`channel ${channelName} starting up...`);

// Create a TMI client
const client = new tmi.Client({
  options: { debug: true },
  connection: {
    secure: true,
    reconnect: true
  },
  identity: {
    username: channelName,
    password: `oauth:${oAuthToken}`
  },
  channels: [channelName]
});

client.connect();

lastMessageArray.push({ "role": "system", "content": personalityPrompt });

client.on('message', async (channel: any, tags: {
  id: any; username: any;
}, message: any, self: any) => {
  // Ignore messages from the bot itself
  if (self) return;

  // Ignore messages that have already been processed
  if (processedMessageIds[tags.id]) {
    console.log(`Ignoring duplicate message with ID ${tags.id}`);
    return;
  }

  // Mark this message as processed
  processedMessageIds[tags.id] = true;

  // remove the oldest message from the array
  if (lastMessageArray.length > chatHistorySize) {
    // don't remove the oldest message if it is a system message, then remove the one after it
    if (lastMessageArray[0].role === 'system') {
      lastMessageArray.splice(1, 1);
    } else {
      lastMessageArray.shift();
    }
  }

  // structure tohold each users settings and personality prompts
  const userSettings: any = {};

  // add user if doesn't exist, else update last message timestamp in userSettings
  if (tags.username) {
    if (!userSettings[tags.username]) {
      userSettings[tags.username] = {};
    }
    userSettings[tags.username].lastMessageTimestamp = admin.database.ServerValue.TIMESTAMP;
  }
  console.log(`Received message: ${message}\nfrom ${tags.username} in ${channel}\nwith tags: ${JSON.stringify(tags)}\n`)


  // check message to see if it is a command
  if (message.toLowerCase().replace('answer:', '').trim().startsWith('!help' || message.toLowerCase().replace('answer:', '').trim().startsWith('/help'))) {
    client.say(channel, helpMessage);
    //
    // Personality Prompts list for help with !personalities  
  } else if (message.toLowerCase().startsWith("!personalities") || message.toLowerCase().startsWith("/personalities") || message.toLowerCase().startsWith("!p") || message.toLowerCase().startsWith("/p")) {
    // iterate through the config/personalityPrompts structure of export const PERSONALITY_PROMPTS = and list the keys {'key', ''}
    client.say(channel, `Personality Prompts: {${Object.keys(PERSONALITY_PROMPTS)}}`);
    //
    // Question and Answer mode
  } else {
    let promptArray: any[] = [];
    // copy lastMessageArray into promptArrary prepending the current content member with the prompt variable
    let counter = 0;
    let gptAnswer = '';

    let isStory = false;
    // parse the message to see if it is a question or eipsode request, as a fuzzy nlp type match, where it is free form english chat, it may be called a story too
    if (message.toLowerCase().includes('episode') || message.toLowerCase().includes('story')) {
      isStory = true;
    }

    let personality = '';

    // Assuming PERSONALITY_PROMPTS is defined as a Record with string keys
    const personalitiesFuzzySet = FuzzySet(Object.keys(PERSONALITY_PROMPTS));

    // Extract the first word from the message
    const firstWord = message.split(' ')[0].toLowerCase().trim().replace(',', '').replace(':', '');

    // Use fuzzy matching to find the closest match from the available personalities
    const fuzzyMatch = personalitiesFuzzySet.get(firstWord);
    if (fuzzyMatch && fuzzyMatch[0][0] > 0.7) { // You can adjust the threshold as needed
      personality = fuzzyMatch[0][1];
    }

    let namespace = 'groovypdf';
    // check for either wisdom or science namespace and set the namespace variable
    if (message.toLowerCase().includes('[wisdom]') || message.toLowerCase().includes('wisdom')) {
      namespace = 'groovypdf';
    } else if (message.toLowerCase().includes('[science]') || message.toLowerCase().includes('science')) {
      namespace = 'videoengineer';
    }

    // set refresh if refresh seen in message
    let refresh = false;
    if (message.toLowerCase().includes('[refresh]') || message.toLowerCase().includes('refresh]')) {
      refresh = true;
    }

    // look for [PROMPT] "<prompt>" in the message and extract the prompt
    let prompt = '';
    let customPromptMatch = message.toLowerCase().match(/\[prompt\]\s*\"([^"]*?)(?=\")/i);
    if (customPromptMatch) {
      // try with quotes around the prompt
      prompt = customPromptMatch[1].trim();
    } else {
      // try without quotes around the prompt, go from [PROMPT] to the end of line or newline character
      customPromptMatch = message.toLowerCase().match(/\[prompt\]\s*([^"\n]*?)(?=$|\n)/i);
      if (customPromptMatch) {
        prompt = customPromptMatch[1].trim();
      }
    }
    if (prompt) {
      console.log(`handleSubmit: Extracted commandPrompt: '${prompt}'`);  // Log the extracted customPrompt
      // remove prompt from from question with [PROMPT] "<question>" removed
      message = message.toLowerCase().replace(new RegExp('\\[prompt\\]\\s*\"' + prompt + '\"', 'i'), '').trim();
      console.log(`handleSubmit: Command Prompt removed from question: '${message}' as ${prompt}`);  // Log the updated question
    }

    if (personality === '' && message.toLowerCase().startsWith('!image') || message.toLowerCase().startsWith('/image') || message.toLowerCase().startsWith('image')) {
      personality = 'passthrough';
    }

    if (message.length > messageLimit) {
      console.log(`handleSubmit: Message length ${message.length} exceeds limit of ${messageLimit}. Truncating message.`);
      client.say(channel, `Sorry, your message is too long. Please keep it under ${messageLimit} characters. Truncaging your message to ${messageLimit} characters.`);
      message = message.slice(0, messageLimit);
    }

    if (personality && personality != 'passthrough' && !PERSONALITY_PROMPTS.hasOwnProperty(personality)) {
      console.error(`buildPrompt: Personality "${personality}" does not exist in PERSONALITY_PROMPTS object.`);
      client.say(channel, `Sorry, personality "${personality}" does not exist in my database. Type !personalities to see a list of available personalities.`);
    } else if (personality) {
      let userContext = '';
      if (storeUserMessages) {
        try {
          await storeUserMessage(tags.username, message, namespace);
          const results = await searchRelatedConversations(message, 3);

          // read the results and build the userContext
          // results can be like:
          // [{"pageContent":"would you like to see the ocean?","metadata":{"username":"testuser"}},
          //   { "pageContent": "would you like to see the ocean?", "metadata": { "namespace": "chathistory", 
          //     "timestamp": 1692077316671, "type": "message", "username": "testuser" } }]
          results.forEach((result: any) => {
            if (result.metadata && result.metadata.username) {
              userContext += `${result.metadata.username}: ${result.pageContent}\n`;
            }
          });

          console.log(`Historical userContext for ${tags.username}: ${userContext}`);
        } catch (error) {
          console.error(`handleSubmit: Error storing user message: ${error}`);
        }
      }

      // Add the command to the Realtime Database
      const newCommandRef = db.ref(`commands/${channelName}`).push();
      newCommandRef.set({
        channelName: channelName,
        type: isStory ? 'episode' : 'question',
        title: `${tags.username} ${isStory ? "asked to create the story" : "asked the question"}: ` + message,
        username: tags.username, // Add this line to record the username
        personality: personality,
        namespace: namespace,
        refresh: refresh,
        prompt: `User Chat History: ${userContext}\n\n${prompt}\n\n${isStory ? "Create a story from the plotline presented" : "Answer the question asked"} by the Twitch chat user ${tags.username} speaking to them directly. Reference the User Chat History if it exists to help you answer the question.`,
        timestamp: admin.database.ServerValue.TIMESTAMP
      });

      // Use GPT to talk back in chat
      if (answerInChat) {
        lastMessageArray.forEach((messageObject: any) => {
          if (messageObject.role && messageObject.content) {
            promptArray.push({ "role": messageObject.role, "content": messageObject.content });
          }
          counter++;
        });
        // add the current message to the promptArray with the final personality prompt
        promptArray.push({ "role": "user", "content": `Personality: ${personalityPrompt}\n\n Question: ${message}\n\nAnswer:` });
        // save the last message in the array for the next prompt
        lastMessageArray.push({ "role": "user", "content": `${message}` });

        console.log(`OpenAI promptArray:\n${JSON.stringify(promptArray, null, 2)}\n`);

        fetch(`https://api.openai.com/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openApiKey}`,
          },
          body: JSON.stringify({
            model: llm,
            max_tokens: maxTokens,
            temperature: temperature,
            top_p: 1,
            n: 1,
            stream: false,
            messages: promptArray,
          }),
        })
          .then(response => {
            if (!response.ok) {
              throw new Error(`Failed to generate OpenAI response:\n${response.statusText} (${response.status}) - ${response.body}\n`);
            }
            return response.json();
          })
          .then(data => {
            if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
              const aiMessage = data.choices[0].message;
              console.log(`OpenAI response:\n${JSON.stringify(aiMessage, null, 2)}\n`);

              console.log(`OpenAI usage:\n${JSON.stringify(data.usage, null, 2)}\nfinish_reason: ${data.choices[0].finish_reason}\n`);

              gptAnswer = aiMessage.content;
              client.say(channel, aiMessage.content);

              lastMessageArray.push({ aiMessage });
            } else {
              console.error('No choices returned from OpenAI!\n');
              console.log(`OpenAI response:\n${JSON.stringify(data)}\n`);
            }
          })
          .catch(error => console.error('An error occurred:', error));
      }
    } else {
      // Handle the case when the first word does not match any personality
      client.say(channel, `Sorry, I can only respond if the message starts with a recognized personality "<personality> <question>".\n${helpMessage}`);
    }
  }
});

// Listen for new data in the 'responses' path
db.ref('responses').on('child_added', (snapshot) => {
  const docData = snapshot.val();
  console.log(`Received message from Groovy:\n${JSON.stringify(docData)}\n`);

  // confirm members exist in docData
  if (!docData.channel || !docData.message) {
    console.log(`Groovy sent Invalid Messsage Format:\n${JSON.stringify(docData)}\n`);
    return;
  }

  if (docData.channel !== channelName) {
    console.log(`Groovys Message not for this channel, ignoring ${docData.channel} != ${channelName}:\n${JSON.stringify(docData)}\n}`);
    return;
  }

  // Delete the data
  snapshot.ref.remove();

  // Extract the channel and message from the data
  const channel = docData.channel;
  const message = docData.message;

  console.log(`Sending message to channel ${channel}: ${message}`);
  // Send the message to the channel
  client.say(channel, `${message}`);
});


