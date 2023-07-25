import type { NextApiRequest, NextApiResponse } from 'next';
import admin from 'firebase-admin';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';


// Initialize Firebase Admin SDK
if (admin && admin.apps && !admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
}

const db = admin.firestore();

const allowedUserId = process.env.TWITCH_ALLOWED_USER_ID ? process.env.TWITCH_ALLOWED_USER_ID : '';
const debug = process.env.DEBUG === 'true' ? true : false;

export default async function handler(req: NextApiRequestWithUser, res: NextApiResponse) {
  await authCheck(req, res, async () => {

    if (req.method === 'GET') {
      // Get the channel name from the query parameters
      const { channelName, userId } = req.query;

      if (userId != allowedUserId) {
        console.log(`Unauthorized user ${userId} tried to get commands for channel ${channelName}`);
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Get the commands for this channel from Firestore
      const snapshot = await db.collection('commands').where('channelId', '==', channelName).get();

      if (snapshot.empty) {
        // output with a timestamp and date
        console.log(`${new Date().toLocaleString()} CommandAPI: No Twitch Chat Commands found for channel ${channelName}`);
        if (debug) {
          console.log(`CommandAPI: Twitch Chat Commands document snapshot ${JSON.stringify(snapshot, null, 2)}`);
        }
        return res.status(404).json({ error: 'CommandAPI: No Twitch Chat Commands found' });
      }

      console.log(`CommandAPI: Found ${snapshot.size} Twitch Chat Commands for channel ${channelName}.`);

      // Create an array of commands
      const commands: any[] = [];
      snapshot.forEach(doc => {
        const commandDoc = JSON.stringify(doc.data());
        console.log(`Found command ${doc.id} for channel ${channelName} - ${commandDoc}`);
        const data = doc.data();
        data.id = doc.id;  // Include the document ID in the data
        commands.push(data);
      });

      // Send the commands to the client
      return res.status(200).json(commands);
    } else {
      return res.status(405).json({ error: 'Invalid request method' });
    }
    return res.status(500).json({ error: 'An error occurred while processing your request' });
  });
}
