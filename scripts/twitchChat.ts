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
const messageLimit: number = process.env.TWITCH_MESSAGE_LIMIT ? parseInt(process.env.TWITCH_MESSAGE_LIMIT) : 1000;

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

let lastMessageArray: string[] = [];
const processedMessageIds: { [id: string]: boolean } = {};

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

  // check if message is in lastMessageArray, if so ignore it
  if (lastMessageArray.includes(message)) {
    console.log(`Message already received, ignoring: ${message}`);
    return;
  }
  // remove the oldest message from the array
  if (lastMessageArray.length > 30) {
    lastMessageArray.shift();
  }

  console.log(`Received message: ${message}\nfrom ${tags.username} in ${channel}\nwith tags: ${JSON.stringify(tags)}\n`)

  if (message.length > messageLimit) {
    console.log(`Message too long, truncating to ${messageLimit} characters.\n`);
    client.say(channel, `GAIB ${tags.username} sorry the message is too long. Truncating it to ${messageLimit} characters.`);
  }

  // Check if the message is a command
  // If the message contains "GAIB" or "gaib", make a call to the OpenAI API
  if (message.toLowerCase().includes('gaib') || message.toLowerCase().includes('!gaib') || message.toLowerCase().includes('groovyaibot') || message.toLowerCase().includes('how')) {
    const prompt: string = `Please answer the following question as GAIB the Groovy AI Bot. Be helpful and kind, try to help them with how to send commands, which are generally these: !episode: <title> - <plot> or !question: <question> with usage of [REFRESH] to clear context, [PERSONALITY] <role> to change the personality, list personalities with !personalities, and [WISDOM] or [SCIENCE] to control context and backing vector store. [PROMPT] "<custom prompt>" to override and customize the personality completely. Mention !help as the command to see all help output options. If they ask for a recommendation or to generate a story, use the syntax to do that as !episode: <title> - <plotline> as a single episode/line output. Do not prefix the output with any Answer: type prefix, especially for !commands: when output for episode recommendation/playback....\n\nQuestion: `;
    const openApiKey: string = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY : '';

    if (!openApiKey) {
      console.error('No OpenAI API Key provided');
      return;
    }

    let llm = 'text-davinci-002';

    fetch(`https://api.openai.com/v1/engines/${llm}/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openApiKey}`,
      },
      body: JSON.stringify({
        prompt: `${prompt} ${message}`,
        max_tokens: 60,
        temperature: 0.9,
        top_p: 1,
        n: 1,
        stream: false,
      }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to generate OpenAI response:\n${response.statusText} (${response.status}) - ${response.body}\n`);
        }
        return response.json();
      })
      .then(data => {
        const { choices } = data;

        // Send the first OpenAI response to the Twitch chat
        // Send the first OpenAI response to the Twitch chat
        if (choices && choices.length > 0) {
          // output each paragraph or output separately split by the line breaks if any, or if the output is too long
          const output = choices[0].text;
          const outputArray = output.split('\n\n'); // split by two line breaks to separate paragraphs
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
        } else {
          console.error('No choices returned from OpenAI!\n');
        }
      })
      .catch(error => console.error('An error occurred:', error));
  } else if (message.toLowerCase().replace('answer:', '').trim().startsWith('!help')) {
    client.say(channel, "!help - get help...\n" +
    "GAIB Commands: !episode: <title> - <plotline>.   \n" + 
    "!question: <question>   \n" +
    "[REFRESH], [PERSONALITY] <personalty>, [WISDOM] or [SCIENCE] for general context of output.   \n" +
    "[PROMPT] \"<custom personality prompt>\" to override the personality completely.   \n" +
    "All lower case, type !personalities for a list of the personalities.   \n" +
    "Example: !episode: [PERSONALITY] Anime [REFRESH][WISDOM] buddha is enlightened - the story of the buddha.   Also mentioning my name GAIB will answer other questions, or we can just talk :).\n");
  } else if (message.toLowerCase().startsWith("!personalities")) {
    // iterate through the config/personalityPrompts structure of export const PERSONALITY_PROMPTS = and list the keys {'key', ''}
    client.say(channel, `Personality Prompts: {${Object.keys(PERSONALITY_PROMPTS)}}`);
  } else if (message.toLowerCase().replace('answer:', '').trim().startsWith('!episode') || message.toLowerCase().replace('answer:', '').trim().startsWith('!question')) {
    // Parse the title and plotline from the command
    let title: any = '';
    let plotline: any = '';
    let cutStart: number = message.indexOf(':') ? message.indexOf(':') + 1 : 8;
    if (message.includes('-')) {
      [title, plotline] = message.slice(0,messageLimit).slice(cutStart).trim().replace(/(\r\n|\n|\r)/gm, " ").split('-');
    } else {
      title = message.slice(0,messageLimit).slice(cutStart).trim().replace(/(\r\n|\n|\r)/gm, " ");
    }
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
      console.log(`Switching to Episode Mode for: ${title} - ${plotline}\n`);
      client.say(channel, `GAIB ${tags.username} Playing Episode Title: ${title}, Plotline: ${plotline}`);
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
  } else {
    console.log(`GAIB Unknown command: ${message}\nfrom ${tags.username} in ${channel}\nwith tags: ${JSON.stringify(tags)}\n`);
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


