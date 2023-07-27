import admin from 'firebase-admin';
import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';

dotenv.config();

/// Initialize Firebase Admin
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

const db = admin.database();
const storage = new Storage();
const bucketName: string = process.env.NEXT_PUBLIC_GCS_BUCKET_NAME ? process.env.NEXT_PUBLIC_GCS_BUCKET_NAME : '';
const bucket = storage.bucket(bucketName);

async function normalizeDbRecords() {
  // List all the JSON files in the 'stories' directory
  const [files] = await bucket.getFiles({ prefix: 'stories/' });
  const jsonFiles = files.filter(file => file.name.endsWith('data.json'));

  for (const file of jsonFiles) {
    // Download the file and parse the JSON content
    const [content] = await file.download();
    const story = JSON.parse(content.toString());

    // Extract the necessary information
    const { userId, text, imageUrls, timestamp, thumbnailUrls } = story;

    // Use the story ID from the file path to find the corresponding record in the Realtime Database
    const storyId = file.name.split('/')[1];

    // Prepare the data to update
    const updateData = {
      userId,
      text,
      imageUrls,
      timestamp,
      // Add other fields as necessary
    };

    // Update the record with the extracted information
    await db.ref('stories').child(storyId).update(updateData);

    console.log(`Updated record for story ID: ${storyId}`);
  }

  console.log('Finished updating all records.');
}

normalizeDbRecords().catch(console.error);

