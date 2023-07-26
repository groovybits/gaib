import { NextApiRequest, NextApiResponse } from 'next';
import * as admin from 'firebase-admin';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';

// Initialize the Firebase Admin SDK
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

const allowedUserId = process.env.TWITCH_ALLOWED_USER_ID || '';

export default async function handler(req: NextApiRequestWithUser, res: NextApiResponse) {
  await authCheck(req, res, async () => {

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed, use POST' });
    }

    const { channel, message, userId } = req.body;

    if (userId != allowedUserId) {
      console.log(`Unauthorized user ${userId} tried to add a response`);
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!channel || !message) {
      return res.status(400).json({ error: 'Missing required fields: channel and message' });
    }

    await db.ref('responses').push({
      channel,
      message,
    });

    res.status(200).json({ message: 'Response added successfully' });
  });
}
