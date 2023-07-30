import type { NextApiRequest, NextApiResponse } from 'next';
import { Storage } from '@google-cloud/storage';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';
import * as admin from 'firebase-admin';

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

const db = admin.firestore();
const storage = new Storage();
const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET_NAME || '';
const bucket = storage.bucket(bucketName as string);
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';

export default async function handler(req: NextApiRequestWithUser, res: NextApiResponse) {
  await authCheck(req, res, async () => {
    if (req.method === 'POST') {
      // Extract the story from the request body
      const story = req.body;

      // Generate the story ID
      const storyId = story.id;

      // Convert the story data to JSON
      const storyJson = JSON.stringify(story);

      // Upload the JSON file to the GCS bucket
      const blob = bucket.file(`stories/${storyId}/data.json`);
      await blob.save(storyJson, { contentType: 'application/json' });

      // Get the URL of the uploaded JSON file
      const storyUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      const shareUrl = `${baseUrl}/${storyId}`

      // Extract the necessary information
      const { userId, text, imageUrls, timestamp } = story;

      // Create a record in the Realtime Database with the URL of the JSON file and other fields
      const rtDb = admin.database();
      await rtDb.ref('stories').child(storyId).set({
        url: storyUrl,
        userId,
        text,
        imageUrls,
        timestamp,
        isStory: story.isStory,
        title: story.title,
        titleImage: story.titleImage,
        prompt: story.prompt,
        namespace: story.namespace,
        tokens: story.tokens,
        personality: story.personality,
        references: story.references,
        audioFiles: story.audioFiles,
      });

      res.status(200).json({ message: 'Story shared successfully', storyUrl: storyUrl, shareUrl: shareUrl });
    } else {
      res.status(405).json({ message: 'Method not allowed' });
    }
  });
}