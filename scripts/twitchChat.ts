import tmi from 'tmi.js';
import admin from 'firebase-admin';

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

console.log(`channel ${channelName} with oAuth: ${oAuthToken}`);

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

client.on('message', (channel: any, tags: { username: any; }, message: { startsWith: (arg0: string) => any; slice: (arg0: number) => { (): any; new(): any; split: { (arg0: string): [any, any]; new(): any; }; }; }, self: any) => {
  // Ignore messages from the bot itself
  if (self) return;

  console.log(`Received message: ${message} from ${tags.username} in ${channel} with tags: ${JSON.stringify(tags)}`)

  // Check if the message is a command
  if (message.startsWith('!episode:')) {
    // Parse the title and plotline from the command
    const [title, plotline] = message.slice(9).split(' - ');

    // Check if both title and plotline are defined
    if (title && plotline) {
      // Add the command to Firestore
      const docRef = db.collection('commands').doc();
      docRef.set({
        channelId: channelName,
        type: 'episode',
        title,
        plotline,
        username: tags.username, // Add this line to record the username
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      console.log(`Invalid command format. Use: !episode: title - plotline (received: ${message})`);
    }
  } else {
    console.log(`Unknown command: ${message}`);
  }
});

