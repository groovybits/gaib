import * as admin from 'firebase-admin';
import type { NextApiRequest, NextApiResponse } from 'next';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID as string,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL as string,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY as string).replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL as string,
  });
}

// Get a reference to the Firebase Realtime Database
const db = admin.database();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Get the nextPageToken from the query parameters
    const nextPageToken = req.query.nextPageToken as string | undefined;

    // Create a reference to the stories in the database
    let ref = db.ref('stories').orderByChild('timestamp').limitToLast(21);

    // If a nextPageToken was provided, start at that story
    if (nextPageToken) {
      ref = ref.endAt(Number(nextPageToken));
    }

    // Fetch the stories
    const snapshot = await ref.once('value');
    const stories = snapshot.val();

    // Convert the stories from an object to an array
    const storiesArray = Object.keys(stories).map((key) => ({
      id: key,
      ...stories[key],
    }));

    // Sort the stories by timestamp in descending order
    storiesArray.sort((a, b) => b.timestamp - a.timestamp);

    // Remove the last story from the array and use its timestamp as the nextPageToken
    const lastStory = storiesArray.pop();
    const newNextPageToken = lastStory ? lastStory.timestamp : null;

    // Send the stories and the new nextPageToken in the response
    res.status(200).json({ stories: storiesArray, nextPageToken: newNextPageToken });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}