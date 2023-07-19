import WebSocket from 'ws';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const db = admin.firestore();

// Get the channel name from the command line arguments
const channelName = process.argv[2];

// Create a WebSocket connection to the Twitch PubSub system
const twitchWs = new WebSocket('wss://pubsub-edge.twitch.tv');

twitchWs.on('open', () => {
  // Send a LISTEN request with your topics and authentication
  twitchWs.send(JSON.stringify({
    type: 'LISTEN',
    data: {
      topics: ['chat_moderator_actions.<userID>.<channelName>'],
      auth_token: '<Your OAuth Token>'
    }
  }));
});

twitchWs.on('message', (data: any) => {
  // Parse the incoming message
  const message = JSON.parse(data.toString());

  // Check if it's a chat message
  if (message.type === 'MESSAGE') {
    // Parse the chat message
    const chatMessage = message.data.message;

    // Check if it's a command
    if (chatMessage.startsWith('!episode:')) {
      // Parse the title and plotline from the command
      const [title, plotline] = chatMessage.slice(9).split(' - ');

      // Add the command to Firestore
      const docRef = db.collection('commands').doc();
      docRef.set({
        channelId: channelName,
        type: 'episode',
        title,
        plotline,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }
});
