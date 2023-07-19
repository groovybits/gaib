import type { NextApiRequest, NextApiResponse } from 'next';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const db = admin.firestore();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Get the channel name from the query parameters
    const { channelName } = req.query;

    // Get the commands for this channel from Firestore
    const snapshot = await db.collection('commands').where('channelId', '==', channelName).get();

    const commands: any[] = [];
    snapshot.forEach(doc => {
      commands.push(doc.data());
    });

    // Send the commands to the client
    res.status(200).json(commands);
  } else {
    res.status(405).json({ error: 'Invalid request method' });
  }
}
