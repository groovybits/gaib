import * as admin from 'firebase-admin';
import type { NextApiRequest, NextApiResponse } from 'next';

const debug = process.env.DEBUG ? process.env.DEBUG === 'true' : false;

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
    // Log the incoming request
    if (debug) {
      console.log('Received GET request with query:', req.query);
    }

    // Get the nextPageToken from the query parameters
    const nextPageToken = req.query.nextPageToken as string | undefined;

    // Create a reference to the stories in the database
    let ref = db.ref('stories').orderByChild('timestamp').limitToLast(21);

    // If a nextPageToken was provided, end at that story
    if (nextPageToken) {
      ref = ref.endAt(parseInt(nextPageToken));
    }

    // Fetch the stories
    const snapshot = await ref.once('value');
    let stories = snapshot.val();

    // Convert the stories from an object to an array
    let storiesArray = Object.keys(stories).map((key) => ({
      id: stories[key].id || key, // Use the id property of the story if it exists, else use the key
      ...stories[key],
    }));

    if (storiesArray === undefined || storiesArray === null || storiesArray.length === 0) {
      res.status(404).json({ message: 'No stories found' });
      return;
    }

    // Sort the stories by timestamp in descending order
    storiesArray.sort((a, b) => b.timestamp - a.timestamp);

    // If there are more than 20 stories, remove the last one and use its timestamp as the nextPageToken
    let nextPageTokenOut = null;
    if (storiesArray.length > 20) {
      const lastStory = storiesArray.pop();
      nextPageTokenOut = lastStory.timestamp.toString();
    }

    // Log the stories being returned
    if (debug) {
      console.log('Returning stories:', storiesArray);
    }

    // Send the stories and nextPageToken in the response
    res.status(200).json({ items: storiesArray, nextPageToken: nextPageTokenOut });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
