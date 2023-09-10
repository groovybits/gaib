import tmi from 'tmi.js';
import admin from 'firebase-admin';
import { PERSONALITY_PROMPTS, PERSONALITY_IMAGES } from '@/config/personalityPrompts';
import { Episode } from '@/types/story';
import { Document } from "langchain/document";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import { pinecone } from '@/utils/pinecone-client';
import { first } from 'lodash';

const USER_INDEX_NAME = process.env.PINECONE_INDEX_NAME ? process.env.PINECONE_INDEX_NAME : '';
const storeUserMessages = true;  //process.env.STORE_USER_MESSAGES ? process.env.STORE_USER_MESSAGES === 'true' ? true : false : false;
const defaultPersonality = process.env.DEFAULT_PERSONALITY ? process.env.DEFAULT_PERSONALITY : 'god';
const chatNamespace = "chatmessages";
const allowPersonalityOverride = true;  //process.env.ALLOW_PERSONALITY_OVERRIDE ? process.env.ALLOW_PERSONALITY_OVERRIDE === 'true' ? true : false : false;
const allowImageOverride = false;  //process.env.ALLOW_IMAGE_OVERRIDE ? process.env.ALLOW_IMAGE_OVERRIDE === 'true' ? true : false : false;
const index = pinecone.Index(USER_INDEX_NAME);
const embeddings = new OpenAIEmbeddings();
const allowStories = false;  //process.env.ALLOW_STORIES ? process.env.ALLOW_STORIES === 'true' ? true : false : false;

// Function to initialize the user index
async function initializeUserIndex(docs: Document[], namespace: string) {
  console.log(`Initialize ${namespace}: user index ${index} with ${docs.length} documents.`);
  await PineconeStore.fromDocuments(docs, embeddings, {
    pineconeIndex: index,
    namespace: namespace,
    textKey: 'text',
  });
}

// Function to store a user message
async function storeUserMessage(username: string, message: string, namespace: string, personality: string) {
  const doc = new Document({
    pageContent: message,
    metadata: { username: username, timestamp: Date.now(), type: 'message', namespace: namespace, personality: personality },
  });

  console.log(`Storing ${namespace}: Personality ${personality} for user ${username}'s message: ${JSON.stringify(doc)}.`);
  await initializeUserIndex([doc], namespace);
}

// Function to search related conversations
async function searchRelatedConversations(query: string, namespace: string, personality: string, username: string, k: number = 3): Promise<any[]> {
  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex: index,
    textKey: 'text',
    namespace,
  });

  console.log(`Searching ${namespace}: Personality: ${personality} for user ${username}'s related conversations to query: ${query}.`);
  return await vectorStore.similaritySearch(query, k, { personality: personality, namespace: namespace, username: username, type: 'message' });
}

// TypeScript function to sanitize input by escaping special characters
const sanitizeInput = (input: string): string => {
  const escapeMap: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
    '${': '&#36;&#123;',
  };

  return input.replace(/[&<>"'`=/\${}]/g, (char) => escapeMap[char]);
};

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
Help: - Ask me anything.

Commands:
  !help - Display this help message.

Example:
 what should I wear today?
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

// Store usernames initially present in the room
let initialUsers: Set<string> = new Set();
let newUsers: Set<string> = new Set();  // Yoda's wisdom: A new set for users joining after initialization
let hasInitialized: boolean = false;

// Yoda's wisdom: Delay the initialization to ensure the bot has connected and received the initial 'join' events
setTimeout(() => {
  hasInitialized = true;
}, 5000);  // 5-second delay

// Yoda's wisdom: Welcome only new users when they join the room
client.on('join', (channel: any, username: any, self: any) => {
  if (self) return;  // Ignore messages from the bot itself

  // Yoda's wisdom: If the bot has initialized, and the user is new, welcome them
  if (hasInitialized && !initialUsers.has(username) && !newUsers.has(username)) {
    client.say(channel, `Welcome to the channel, ${username}! Use <personality> <message> to ask a question, and !personalities to see the available personalities.`);
    newUsers.add(username);  // Yoda's wisdom: Add the user to the newUsers set
  }

  // Yoda's wisdom: Add username to the initialUsers set to avoid welcoming again
  if (!hasInitialized) {
    initialUsers.add(username);
  }
});

lastMessageArray.push({ "role": "system", "content": personalityPrompt });

client.on('message', async (channel: any, tags: {
  id: any; username: any;
}, message: any, self: any) => {
  // Ignore messages from the bot itself
  if (self) return;

  message = sanitizeInput(message);

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
    client.say(channel, `Personality Prompts: {${Object.keys(PERSONALITY_IMAGES)}}`);
    //
    // Question and Answer mode
  } else {
    let promptArray: any[] = [];
    // copy lastMessageArray into promptArrary prepending the current content member with the prompt variable
    let counter = 0;
    let gptAnswer = '';

    let isStory = false;
    // parse the message to see if it is a question or eipsode request, as a fuzzy nlp type match, where it is free form english chat, it may be called a story too
    if (allowStories && message.toLowerCase().includes('episode')) {
      isStory = true;
    }

    let personality = '';

    if (allowPersonalityOverride) {
      // Extract the first word from the message
      const firstWord = message.split(' ')[0].toLowerCase().trim().replace(',', '').replace(':', '');

      // see if firstWord matches one of the PERSONALITY_IMAGES members
      if (PERSONALITY_IMAGES.hasOwnProperty(firstWord)) {
        personality = firstWord;
        console.log(`handleSubmit: Extracted personality: '${personality}' for ${tags.username}`);  // Log the extracted personality
      }
    }

    // if personality wasn't given as the first work, then send a message about syntax being <personality> <message>
    if (personality === '') {
      client.say(channel, `Sorry, ${tags.username} you need to specify a personality as the first word in your message. Type !personalities to see a list of available personalities.`);
      return;
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

    if (allowImageOverride) {
      if (personality === '' && message.toLowerCase().startsWith('!image') || message.toLowerCase().startsWith('/image') || message.toLowerCase().startsWith('image')) {
        personality = 'passthrough';
      }
    }

    if (message.length > messageLimit) {
      console.log(`handleSubmit: Message length ${message.length} exceeds limit of ${messageLimit}. Truncating message.`);
      client.say(channel, `Sorry, your message is too long. Please keep it under ${messageLimit} characters. Truncaging your message to ${messageLimit} characters.`);
      message = message.slice(0, messageLimit);
    }

    const dateNow = new Date();
    const formattedDateNow = `${dateNow.getMonth() + 1}/${dateNow.getDate()}/${dateNow.getFullYear()} ${dateNow.getHours()}:${dateNow.getMinutes()}:${dateNow.getSeconds()}`;

    if (personality && personality != 'passthrough' && !PERSONALITY_PROMPTS.hasOwnProperty(personality)) {
      console.error(`User ${tags.username}: Personality "${personality}" does not exist in PERSONALITY_PROMPTS object.`);
      client.say(channel, `Sorry, ${tags.username} personality "${personality}" doesn't exist. Type !personalities to see a list of available personalities.`);
      return;
    }

    // if the personality was not defined, send to the default personality
    if (personality && !PERSONALITY_PROMPTS.hasOwnProperty(personality)) {
      personality = defaultPersonality;
    }

    let userContext = '';
    if (storeUserMessages === true && personality !== '') {
      try {
        // search for related conversations
        const results = await searchRelatedConversations(message, chatNamespace, personality, tags.username, 1);

        // read the results and build the userContext
        // results can be like:
        // [{"pageContent":"would you like to see the ocean?","metadata":{"username":"testuser"}},
        //   { "pageContent": "would you like to see the ocean?", "metadata": { "namespace": "chathistory", 
        //     "timestamp": 1692077316671, "type": "message", "username": "testuser" } }]
        results.forEach((result: any) => {
          const date = new Date(result.metadata.timestamp);
          const formattedDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;

          if (result.metadata && result.metadata.username && result.metadata.timestamp) {
            userContext += `User ${result.metadata.username} asked: ${result.pageContent} on ${formattedDate}, `;
            console.log(`Chat History ${chatNamespace}: Using Personality ${personality} Related conversation for ${tags.username}: ${JSON.stringify(result)}`);
          } else {
            console.log(`Chat History ${chatNamespace}: Not using Personality ${personality} Related conversation for ${tags.username}: ${JSON.stringify(result)}`);
          }
        });

        console.log(`Derived ${chatNamespace}: Personality ${personality} Historical userContext for ${tags.username}: ${userContext}`);

        // store the user message in the database
        await storeUserMessage(tags.username, message, chatNamespace, personality);
      } catch (error) {
        console.error(`${chatNamespace}: ${personality} Error storing user ${tags.username} message ${message} error: ${error}`);
      }
    } else {
      console.log(`${chatNamespace}: ${personality} Not storing user ${tags.username} message ${message} as storeUserMessages is ${storeUserMessages}.`);
    }

    // Add the command to the Realtime Database
    const newCommandRef = db.ref(`commands/${channelName}`).push();
    newCommandRef.set({
      channelName: channelName,
      type: isStory ? 'episode' : 'question',
      title: personality === 'passthrough' ? "REPLAY: " + message : `${tags.username} said: ` + message,
      username: tags.username, // Add this line to record the username
      personality: personality,
      namespace: namespace,
      refresh: refresh,
      prompt: personality === 'passthrough' ?
        '' :
        `\nThe date is is currently ${formattedDateNow}, anything above this line is context and not the message from ${tags.username}.\n 
          Previous Chat Messages by ${tags.username}:
          ${userContext}.\n
          End of Previous Chat Messages.\n\n
          ${isStory ?
          `Create a story from the plotline presented ` :
          "give your response to the request or comment "} 
          by the Twitch chat user ${tags.username} speaking to them directly. Speak as ${personality} and treat the context as your knowledge to share. 
          use it only if useful in the conversation related to the topic at hand. only reference the "Previous Chat Messages" if they relate to the conversation,
          give the user a sense of you knowing them historically if they have previous chats listed above.\n\n${prompt}\n\n
          Message from ${tags.username}:
          \n${message}\n`,
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


