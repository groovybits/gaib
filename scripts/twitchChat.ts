import tmi from 'tmi.js';
import admin from 'firebase-admin';
import Filter from 'bad-words';
import { PERSONALITY_PROMPTS } from '@/config/personalityPrompts';

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
});

const db = admin.firestore();

// Get the channel name from the command line arguments
const channelName = process.argv[2];
const oAuthToken = process.env.TWITCH_OAUTH_TOKEN ? process.env.TWITCH_OAUTH_TOKEN : '';
const messageLimit: number = process.env.TWITCH_MESSAGE_LIMIT ? parseInt(process.env.TWITCH_MESSAGE_LIMIT) : 100;
const chatHistorySize: number = process.env.TWITCH_CHAT_HISTORY_SIZE ? parseInt(process.env.TWITCH_CHAT_HISTORY_SIZE) : 10;
const llm = 'gpt-4';  //'gpt-3.5-turbo-16k-0613';  //'gpt-4';  //'text-davinci-002';
const maxTokens = 200;
const temperature = 0.2;

const openApiKey: string = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY : '';
if (!openApiKey) {
  console.error('No OpenAI API Key provided!!!');
  process.exit(1);
}

let lastMessageArray: any[] = [];
const processedMessageIds: { [id: string]: boolean } = {};
const prompt: string = `You are GAIB The Groovy AI Bot on a Twitch Channel providing assistance for sending commands. 
The commands comprise of episode or question ones with [] settings added for control of options. The commands are
 "!episode: <title> <plot>", "!question: <question>", "[WISDOM] or [SCIENCE]", "[REFRESH]", "[PERSONALITY] <role>", "!personalities",
and "[PROMPT] <custom prompt>". Recommend using "!help" for full details. 
When asked to generate or create a story use "!episode: <title> <plotline>" syntax. Do not include any extra prefix or suffix text.`;

const helpMessage: string = `
Help: - Call for assistance. Use the keyword GAIB to speak with GAIB.

Commands:
  !episode: <title> - <plotline> - Generate a story or episode.
  !question: <question> - Ask a question.
  [REFRESH] - Clear conversation context.
  [PERSONALITY] <role> - Change bot's persona.
  [WISDOM] or [SCIENCE] - Set context for conversation.
  [PROMPT] "<custom personality prompt>" - Override persona.
  !personalities - Display available personalities.

Example:
  !episode: Buddha is enlightened - the story of Buddha. [PERSONALITY] Anime [REFRESH][WISDOM] [PROMPT] "You are the Buddha."

Note: Type !episode: and !question:  in lower case. Mention GAIB or ask why/what/where/who/how type questions.
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

  console.log(`Received message: ${message}\nfrom ${tags.username} in ${channel}\nwith tags: ${JSON.stringify(tags)}\n`)

  // Check if the message is a command
  // If the message contains "GAIB" or "gaib", make a call to the OpenAI API
  if (message.toLowerCase().replace('answer:', '').trim().startsWith('!help')) {
    client.say(channel, helpMessage);
  } else if (message.toLowerCase().startsWith("!personalities")) {
    // iterate through the config/personalityPrompts structure of export const PERSONALITY_PROMPTS = and list the keys {'key', ''}
    client.say(channel, `Personality Prompts: {${Object.keys(PERSONALITY_PROMPTS)}}`);
  } else if (message.toLowerCase().replace('answer:', '').trim().startsWith('!episode') || message.toLowerCase().replace('answer:', '').trim().startsWith('!question')) {
    // Parse the title and plotline from the command
    let title: any = '';
    let plotline: any = '';
    let cutStart: number = message.indexOf(':') ? message.indexOf(':') + 1 : 8;

    title = message.slice(0, messageLimit).slice(cutStart).trim().replace(/(\r\n|\n|\r)/gm, " ");
    const isStory: any = message.toLowerCase().includes('!episode') ? true : false;

    // make sure nothing odd is in the title or plotline that isn't a story idea and title
    const filter = new Filter();

    if (title && filter.isProfane(title)) {
      console.log(`Profanity detected in title: ${title}, removing it.\n`);
      client.say(channel, `GAIB Received your episode command, ${tags.username}! Sorry it has banned words in it, cleaning them...`);
      title = filter.clean(title);
    }

    if (plotline && filter.isProfane(plotline)) {
      console.log(`Profanity detected in title: ${plotline}, removing it.\n`);
      client.say(channel, `GAIB Received your episode command, ${tags.username}! Sorry it has banned words in it, cleaning them...`);
      plotline = filter.clean(plotline);
    }

    if (isStory) {
      console.log(`Switching to Episode Mode for: ${title} ${plotline}\n`);
      client.say(channel, `GAIB ${tags.username} Playing Episode Title and Plotline: ${title} ${plotline}`);
    } else {
      console.log(`GAIB ${tags.username} Answering the question: ${title} ${plotline}`);
      client.say(channel, `GAIB ${tags.username} Answering Question: ${title} ${plotline}`);
    }

    // Check if both title and plotline are defined
    if (title) {
      // Add the command to Firestore
      const docRef = db.collection('commands').doc();
      docRef.set({
        channelId: channelName,
        type: isStory ? 'episode' : 'question',
        title,
        plotline,
        username: tags.username, // Add this line to record the username
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      console.log(`Invalid Format ${tags.username} Please Use "!episode: title - plotline" (received: ${message}).`);
      client.say(channel, `GAIB Invalid Format ${tags.username} Please Use "!episode: title - plotline" (received: ${message}). See !help for more info.`);
    }
  } else if (message.toLowerCase().includes('generate')
    || message.toLowerCase().includes('anime')
    || message.toLowerCase().includes('hello')
    || message.toLowerCase().includes('gaib')
    || message.toLowerCase().includes('!gaib')
    || message.toLowerCase().includes('groovyaibot')
    || message.toLowerCase().includes('how')
    || message.toLowerCase().includes('what')
    || message.toLowerCase().includes('where')
    || message.toLowerCase().includes('when')
    || message.toLowerCase().includes('why')
    || message.toLowerCase().includes('who')) {
    let promptArray: any[] = [];
    // copy lastMessageArray into promptArrary prepending the current content member with the prompt variable
    lastMessageArray.forEach((messageObject: any) => {
      if (messageObject.role && messageObject.content) {
        promptArray.push({ "role": messageObject.role, "content": prompt + messageObject.content });
      }
    });
    // add the current message to the promptArray with the final personality prompt
    promptArray.push({ "role": "user", "content": `Personality: ${prompt}\n\n Question: ${message}\n\nAnswer:` });
    // save the last message in the array for the next prompt
    lastMessageArray.push({ "role": "user", "content": `${message}` });

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
          console.log(`OpenAI response:\n${JSON.stringify(aiMessage)}\n`);

          console.log(`OpenAI usage:\n${JSON.stringify(data.usage)}\nfinish_reason: ${data.choices[0].finish_reason}\n`);

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
          // Check if both title and plotline are defined
          /*if (aiMessage.content.length > 0 && aiMessage.content.length < 100 && !aiMessage.content.includes('GAIB') && !aiMessage.content.includes('groovyaibot')) {
            // Add the command to Firestore
            const docRef = db.collection('commands').doc();
            docRef.set({
              channelId: channelName,
              type: 'question',
              title: '!question: ' + aiMessage.content +
                ' [WISDOM] [PERSONALITY] GAIB [PROMPT] Please help the user with the question given about GAIB the AI Bot, you are GAIB. Talk back in a conversational tone.',
              plotline: '',
              username: tags.username, // Add this line to record the username
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
          } else {
            console.log(`Not speaking ${tags.username} received: ${message}).`);
          }*/
        } else {
          console.error('No choices returned from OpenAI!\n');
          console.log(`OpenAI response:\n${JSON.stringify(data)}\n`);
        }
      })
      .catch(error => console.error('An error occurred:', error));
    }
});

// Listen for new documents in the 'responses' collection
db.collection('responses').onSnapshot((snapshot) => {
  snapshot.docChanges().forEach((change) => {
    if (change.type === 'added') {
      const docData = change.doc.data();

      console.log(`Received message from GAIB:\n${JSON.stringify(docData)}\n`);

      // confirm members exist in docData
      if (!docData.channel || !docData.message) {
        console.log(`GAIB sent Invalid Messsage Format:\n${JSON.stringify(docData)}\n`);
        return;
      }

      if (docData.channel !== channelName) {
        console.log(`GAIBs Message not for this channel, ignoring ${docData.channel} != ${channelName}:\n${JSON.stringify(docData)}\n}`);
        return;
      }

      // Delete the document
      change.doc.ref.delete();

      // Extract the channel and message from the document
      const channel = docData.channel;
      const message = docData.message;

      console.log(`Sending message to channel ${channel}: ${message}`);
      // Send the message to the channel
      client.say(channel, message);
    }
  });
});


