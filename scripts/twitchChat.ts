import tmi from 'tmi.js';
import admin from 'firebase-admin';
import { PERSONALITY_PROMPTS } from '@/config/personalityPrompts';
import { Episode } from '@/types/story';

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
const messageLimit: number = process.env.TWITCH_MESSAGE_LIMIT ? parseInt(process.env.TWITCH_MESSAGE_LIMIT) : 800;
const promptLimit: number = process.env.GROOVY_PROMPT_LIMIT ? parseInt(process.env.GROOVY_PROMPT_LIMIT) : 1000;
const chatHistorySize: number = process.env.TWITCH_CHAT_HISTORY_SIZE ? parseInt(process.env.TWITCH_CHAT_HISTORY_SIZE) : 3;
const llm = 'gpt-4';  //'gpt-3.5-turbo-16k-0613';  //'gpt-4';  //'text-davinci-002';
const maxTokens = 100;
const temperature = 0.8;

const openApiKey: string = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY : '';
if (!openApiKey) {
  console.error('No OpenAI API Key provided!!!');
  process.exit(1);
}

let lastMessageArray: any[] = [];
const processedMessageIds: { [id: string]: boolean } = {};
const prompt: string = "You're the Moderator and Support on a Twitch Channel, managing an AI story and answer playback system. " +
  "The system commands are: `!episode <description>` to create a new episode, " +
  "`!question <question>` to ask a question, `[wisdom]` or `[science]` to set the knowledge domain, " +
  "`[refresh]` to refresh the system, `[personality] <role>` to set the AI's personality, " +
  "`!personalities` to view available personalities, `[prompt] \" < custom prompt> \"` " +
  "to provide a custom prompt, `!image: <image description > ` to generate an image, " +
  "and`!help` to get detailed instructions.When asked to generate a story or episode, use`!episode: <description>`. " +
  "Always communicate with respect.";

const helpMessage: string = `
Help: - Ask me how to generate anime or general anime questions.

Commands:
  !episode <description> - Generate an episode based on  description.
  !question <question> - Ask a question.
  !image <prompt> - Generate an image based on prompt.
  [refresh] - Clear conversation history, forget everything.
  [personality] <role> - Change bot's personality and role.
  [wisdom] or [science] - Set sources for references.
  [prompt] "<custom personality prompt>" - AI Instructions.
  !personalities - Display available personalities.

Example:
  !episode Buddha is enlightened - the story of Buddha. [personality] Anime [refresh][wisdom] [prompt] "You are the Buddha."

Note: Type !episode and !question  in lower case. Ask any questions and our AI will answer them.
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

lastMessageArray.push({ "role": "system", "content": prompt });

client.on('message', async (channel: any, tags: {
  id: any; username: any;
}, message: any, self: any) => {
  // Ignore messages from the bot itself
  if (self && !message.toLowerCase().startsWith('!episode:') && !message.toLowerCase().startsWith('!question:')) return;

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

  // Check if the message is a command
  if (message.toLowerCase().startsWith('!image')) {
    console.log(`${tags.username} Sending Image to Channel: ${channel}\n`);
    client.say(channel, `${tags.username} Sending Image to Channel: ${channel}`);

    let namespace = 'groovypdf';
    if (message.toLowerCase().includes('[wisdom]')) {
      namespace = 'groovypdf';
      message.replace('[wisdom]', '');
    } else if (message.toLowerCase().includes('[science]')) {
      namespace = 'videoengineer';
      message.replace('[science]', '');
    }

    // Extract a customPrompt if [PROMPT] "<custom prompt>" is given with prompt in quotes, similar to personality extraction yet will have spaces
    let prompt = '';
    try {
      if (message.toLowerCase().includes('[prompt]')) {
        let endPrompt = false;
        let customPromptMatch = message.toLowerCase().match(/\[prompt\]\s*\"([^"]*?)(?=\")/i);
        if (customPromptMatch) {
          // try with quotes around the prompt
          prompt = customPromptMatch[1].trim();
        } else {
          // try without quotes around the prompt, go from [PROMPT] to the end of line or newline character
          customPromptMatch = message.toLowerCase().match(/\[prompt\]\s*([^"\n]*?)(?=$|\n)/i);
          if (customPromptMatch) {
            prompt = customPromptMatch[1].trim();
            endPrompt = true;
          }
        }
        if (prompt) {
          console.log(`handleSubmit: Extracted commandPrompt: '${prompt}'`);  // Log the extracted customPrompt
          // remove prompt from from question with [PROMPT] "<question>" removed
          if (endPrompt) {
            message = message.toLowerCase().replace(new RegExp('\\[prompt\\]\\s*' + prompt, 'i'), '').trim();
          } else {
            message = message.toLowerCase().replace(new RegExp('\\[prompt\\]\\s*\"' + prompt + '\"', 'i'), '').trim();
          }
          console.log(`handleSubmit: Command Prompt removed from question: '${message}' as ${prompt}`);  // Log the updated question
        } else {
          console.log(`handleSubmit: No Command Prompt found in question: '${message}'`);  // Log the question
        }
      }
    } catch (error) {
      console.error(`handleSubmit: Error extracting command Prompt: '${error}'`);  // Log the question  

      client.say(channel, `Sorry, I failed a extracting the command Prompt, please try again.`);
    }

    let imagePrompt = message.slice(0, promptLimit).trim();
    if (imagePrompt) {
      // Add the command to the Realtime Database
      const newCommandRef = db.ref(`commands/${channelName}`).push();
      newCommandRef.set({
        channelName: channelName,
        type: 'question',
        title: imagePrompt,
        personality: 'passthrough',
        namespace: namespace,
        refresh: false,
        prompt: prompt,
        username: tags.username, // Add this line to record the username
        timestamp: admin.database.ServerValue.TIMESTAMP
      });
    } else {
      console.log(`Invalid Format ${tags.username} Please Use "!image: <prompt>" (received: ${message}).`);
      client.say(channel, `Groovy: Invalid Format ${tags.username} Please Use "!image: <prompt>" (received: ${message}). See !help for more info.`);
    }
  } else if (message.toLowerCase().replace('answer:', '').trim().startsWith('!help' || message.toLowerCase().replace('answer:', '').trim().startsWith('/help'))) {
    client.say(channel, helpMessage);
  //
  // Personality Prompts list for help with !personalities  
  } else if (message.toLowerCase().startsWith("!personalities") || message.toLowerCase().startsWith("/personalities")) {
    // iterate through the config/personalityPrompts structure of export const PERSONALITY_PROMPTS = and list the keys {'key', ''}
    client.say(channel, `Personality Prompts: {${Object.keys(PERSONALITY_PROMPTS)}}`);
  //
  // Question and Answer modes
  } else if (
    message.toLowerCase().replace('answer:', '').trim().startsWith('!episode')
    || message.toLowerCase().replace('answer:', '').trim().startsWith('!question')
    || message.toLowerCase().replace('answer:', '').trim().startsWith('episode')
    || message.toLowerCase().replace('answer:', '').trim().startsWith('question')
  ) {
    // Parse the title and plotline from the command
    let title: any = '';

    let namespace = 'groovypdf';
    if (message.toLowerCase().includes('[wisdom]')) {
      namespace = 'groovypdf';
      message.replace('[wisdom]', '');
    } else if (message.toLowerCase().includes('[science]')) {
      namespace = 'videoengineer';
      message.replace('[science]', '');
    }

    let personality = 'groovy';
    try {
      if (message.toLowerCase().includes('[personality]')) {
        let personalityMatch = message.toLowerCase().match(/\[personality\]\s*([\w\s]*?)(?=\s|$)/i);
        if (personalityMatch) {
          let extractedPersonality = personalityMatch[1].toLowerCase().trim() as keyof typeof PERSONALITY_PROMPTS;
          if (!PERSONALITY_PROMPTS.hasOwnProperty(extractedPersonality)) {
            console.error(`buildPrompt: Personality "${extractedPersonality}" does not exist in PERSONALITY_PROMPTS object.`);
            personality = 'groovy' as keyof typeof PERSONALITY_PROMPTS;
            
            client.say(channel, `Sorry, personality "${extractedPersonality}" does not exist in my database.`);
          }
          personality = extractedPersonality;
          console.log(`handleSubmit: Extracted personality: "${personality}"`);  // Log the extracted personality
          message = message.toLowerCase().replace(new RegExp('\\[personality\\]\\s*' + extractedPersonality, 'i'), '').trim();
          message = message.toLowerCase().replace(new RegExp('\\[personality\\]', 'i'), '').trim();
          console.log(`handleSubmit: Updated question: '${message}'`);  // Log the updated question
        } else {
          console.log(`handleSubmit: No personality found in question: '${message}'`);  // Log the question
          
          client.say(channel, `Sorry, I failed a extracting the personality, please try again. Question: ${message}`);
        }
      }
    } catch (error) {
      console.error(`handleSubmit: Error extracting personality: '${error}'`);  // Log the question
      
      client.say(channel, `Sorry, I failed a extracting the personality, please try again.`);
    }

    // Extract a customPrompt if [PROMPT] "<custom prompt>" is given with prompt in quotes, similar to personality extraction yet will have spaces
    let prompt = '';
    try {
      if (message.toLowerCase().includes('[prompt]')) {
        let endPrompt = false;
        let customPromptMatch = message.toLowerCase().match(/\[prompt\]\s*\"([^"]*?)(?=\")/i);
        if (customPromptMatch) {
          // try with quotes around the prompt
          prompt = customPromptMatch[1].trim();
        } else {
          // try without quotes around the prompt, go from [PROMPT] to the end of line or newline character
          customPromptMatch = message.toLowerCase().match(/\[prompt\]\s*([^"\n]*?)(?=$|\n)/i);
          if (customPromptMatch) {
            prompt = customPromptMatch[1].trim();
            endPrompt = true;
          }
        }
        if (prompt) {
          console.log(`handleSubmit: Extracted commandPrompt: '${prompt}'`);  // Log the extracted customPrompt
          // remove prompt from from question with [PROMPT] "<question>" removed
          if (endPrompt) {
            message = message.toLowerCase().replace(new RegExp('\\[prompt\\]\\s*' + prompt, 'i'), '').trim();
          } else {
            message = message.toLowerCase().replace(new RegExp('\\[prompt\\]\\s*\"' + prompt + '\"', 'i'), '').trim();
          }
          console.log(`handleSubmit: Command Prompt removed from question: '${message}' as ${prompt}`);  // Log the updated question
        } else {
          console.log(`handleSubmit: No Command Prompt found in question: '${message}'`);  // Log the question
        }
      }
    } catch (error) {
      console.error(`handleSubmit: Error extracting command Prompt: '${error}'`);  // Log the question  
      
      client.say(channel, `Sorry, I failed a extracting the command Prompt, please try again.`);
    }

    title = message.slice(0, promptLimit).trim();
    const isStory: any = message.toLowerCase().startsWith('!episode') ? true : false;

    // if title is defined and not empty, then add the command to Firestore
    if (title) {
      // Add the command to the Realtime Database
      const newCommandRef = db.ref(`commands/${channelName}`).push();
      newCommandRef.set({
        channelName: channelName,
        type: isStory ? 'episode' : 'question',
        title,
        username: tags.username, // Add this line to record the username
        personality: personality,
        namespace: namespace,
        refresh: false,
        prompt: prompt,
        timestamp: admin.database.ServerValue.TIMESTAMP
      });
    } else {
      console.log(`Invalid Format ${tags.username} Please Use "!episode <description>" (received: ${message}).`);
      client.say(channel, `Groovy Invalid Format ${tags.username} Please Use "!episode <description>" (received: ${message}). See !help for more info.`);
    }
  } else  {
    let promptArray: any[] = [];
    // copy lastMessageArray into promptArrary prepending the current content member with the prompt variable
    let counter = 0;
    lastMessageArray.forEach((messageObject: any) => {
      if (messageObject.role && messageObject.content) {
        promptArray.push({ "role": messageObject.role, "content": messageObject.content });
      }
      counter++;
    });
    // add the current message to the promptArray with the final personality prompt
    promptArray.push({ "role": "user", "content": `Personality: ${prompt}\n\n Question: ${message}\n\nAnswer:` });
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

          // output each paragraph or output separately split by the line breaks if any, or if the output is too long
          const outputArray = aiMessage.content.split('\n\n'); // split by two line breaks to separate paragraphs
          outputArray.forEach((outputParagraph: string) => {
            if (outputParagraph.length > messageLimit) {
              // send as separate messages
              const outputParagraphArray = outputParagraph.match(new RegExp('.{1,' + messageLimit + '}', 'g'));
              if (outputParagraphArray) { // check if outputParagraphArray is not null
                outputParagraphArray.forEach((outputLine: string) => {
                  client.say(channel, outputLine);
                });
              }
            } else {
              client.say(channel, outputParagraph);
            }
          });
          lastMessageArray.push({ aiMessage });
        } else {
          console.error('No choices returned from OpenAI!\n');
          console.log(`OpenAI response:\n${JSON.stringify(data)}\n`);
        }
      })
      .catch(error => console.error('An error occurred:', error));
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


