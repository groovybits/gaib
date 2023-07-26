import type { NextApiRequest, NextApiResponse } from 'next';
import admin from 'firebase-admin';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

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

      // Get the commands for this channel from Realtime Database
      const commandsRef = db.ref(`commands/${channelName}`);
      commandsRef.once('value')
        .then((snapshot) => {
          if (snapshot.exists()) {
            const commandsObj = snapshot.val();
            const commands: any[] = [];
            // Loop through each command
            for (let key in commandsObj) {
              commands.push(commandsObj[key]);
            }
            console.log(`CommandAPI: Found ${commands.length} Twitch Chat Commands for channel ${channelName}.`);

            // Delete the commands after they've been read
            commandsRef.remove()
              .then(() => {
                console.log(`CommandAPI: Deleted ${commands.length} Twitch Chat Commands for channel ${channelName}.`);
              })
              .catch((error) => {
                console.error(`Failed to delete commands from Firebase Realtime Database: ${error}`);
              });

            // Send the commands to the client
            return res.status(200).json(commands);
          } else {
            console.log(`${new Date().toLocaleString()} CommandAPI: No Twitch Chat Commands found for channel ${channelName}`);
            // No commands found
            return res.status(404).json({ error: 'CommandAPI: No Twitch Chat Commands found' });
          }
        })
        .catch((error) => {
          console.error(`Failed to read commands from Firebase Realtime Database: ${error}`);
          return res.status(500).json({ error: 'Failed to read commands from Firebase Realtime Database' });
        });
    } else {
      return res.status(405).json({ error: 'Invalid request method' });
    }
  });
}
