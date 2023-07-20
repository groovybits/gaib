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

const allowedUserId = process.env.NEXT_PUBLIC_ALLOWED_USER_ID ? process.env.NEXT_PUBLIC_ALLOWED_USER_ID : '';

export default async function handler(req: NextApiRequestWithUser, res: NextApiResponse) {
  await authCheck(req, res, async () => {

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await db.collection('commands').doc(id as string).delete();
      res.status(200).json({ message: 'Document deleted' });
    } else {
      res.status(405).json({ error: 'Invalid request method' });
    }
  });
}