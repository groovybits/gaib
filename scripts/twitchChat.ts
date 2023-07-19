import tmi from 'tmi.js';
import admin from 'firebase-admin';
import Filter from 'bad-words';


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
const messageLimit = process.env.TWITCH_MESSAGE_LIMIT ? process.env.TWITCH_MESSAGE_LIMIT : 500;

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

client.on('message', (channel: any, tags: {
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
  if (lastMessageArray.length > 3) {
    lastMessageArray.shift();
  }

  console.log(`Received message: ${message} from ${tags.username} in ${channel} with tags: ${JSON.stringify(tags)}`)

  if (message.length > messageLimit) {
    console.log(`Message too long, truncating to ${messageLimit} characters`);
    client.say(channel, `GAIB Received your episode command, ${tags.username}! Sorry it is too long, truncating to ${messageLimit} characters...`);
  }

  // Check if the message is a command
  if (message.includes('help')) {
    client.say(channel, `GAIB Received your help command, ${tags.username}!`);
    client.say(channel, `GAIB Commands: !episode: <title> - <plotline>\n\n!question: <question>\n\n!help..`);
  } else if (message.startsWith('!episode') || message.startsWith('!question')) {
    // Parse the title and plotline from the command
    let title: any = '';
    let plotline: any = '';
    let cutStart: number = message.indexOf(':') ? message.indexOf(':') + 1 : 8;
    if (message.includes('-')) {
      [title, plotline] = message.slice(0,messageLimit).slice(cutStart).trim().replace(/(\r\n|\n|\r)/gm, " ").split('-');
    } else {
      title = message.slice(0,messageLimit).slice(cutStart).trim().replace(/(\r\n|\n|\r)/gm, " ");
    }
    const isStory: any = message.startsWith('!episode') ? true : false;

    // make sure nothing odd is in the title or plotline that isn't a story idea and title
    const filter = new Filter();

    if (title && filter.isProfane(title)) {
      console.log(`Profanity detected in title: ${title}, removing it`);
      client.say(channel, `GAIB Received your episode command, ${tags.username}! Sorry it has banned words in it, cleaning them...`);
      title = filter.clean(title);
    }

    if (plotline && filter.isProfane(plotline)) {
      console.log(`Profanity detected in title: ${plotline}, removing it`);
      client.say(channel, `GAIB Received your episode command, ${tags.username}! Sorry it has banned words in it, cleaning them...`);
      plotline = filter.clean(plotline);
    }

    if (isStory) {
      console.log(`Received episode command: ${title} - ${plotline}`);
      client.say(channel, `GAIB Received your episode command, ${tags.username}! Title: ${title}, Plotline: ${plotline}`);
    } else {
      console.log(`Received question command: ${title}`);
      client.say(channel, `GAIB Received your question command, ${tags.username}! Question: ${title} ${plotline}`);
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
      console.log(`Invalid command format. Use: !episode: title - plotline (received: ${message})`);
      client.say(channel, `GAIB Received your episode command, ${tags.username}! Sorry it is an Invalid syntax, please use\n\nepisode: <title> - <plotline>\n\nNeeds a dash to get the title and plotline separated`);
    }
  } else {
    console.log(`GAIB Unknown command: ${message} from ${tags.username} in ${channel} with tags: ${JSON.stringify(tags)}`);
  }
});

// Listen for new documents in the 'responses' collection
db.collection('responses').onSnapshot((snapshot) => {
  snapshot.docChanges().forEach((change) => {
    if (change.type === 'added') {
      const docData = change.doc.data();

      console.log(`Received message from GAIB: ${JSON.stringify(docData)}`);

      // confirm members exist in docData
      if (!docData.channel || !docData.message) {
        console.log(`GAIB sent invalid message format. ${JSON.stringify(docData)}`);
        return;
      }

      if (docData.channel !== channelName) {
        console.log(`Message not for this channel, ignoring`);
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


