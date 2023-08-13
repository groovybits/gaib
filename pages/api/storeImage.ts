import type { NextApiRequest, NextApiResponse } from 'next';
import { Storage } from '@google-cloud/storage';
import admin, { firestore } from 'firebase-admin';
import nlp from 'compromise';
import fetch from 'node-fetch';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const db = admin.firestore();
const storage = new Storage();

export default async function handler(req: NextApiRequestWithUser, res: NextApiResponse) {
  await authCheck(req, res, async () => {
    if (req.method === 'POST') {
      const { imageUrl, episodeId, imageUUID } = req.body;

      // Fetch the image
      const response = await fetch(imageUrl);

      if (!response.ok) {
        console.error('storeImage: Error fetching image:', response.statusText);
        res.status(500).json({ error: 'Error fetching image' });
        return;
      }

      if (!response.body) {
        console.error('storeImage: No body in response');
        res.status(500).json({ error: 'No body in response' });
        return;
      }

      // Create a new blob in the bucket and upload the file data
      const bucketName = process.env.GCS_BUCKET_NAME || '';
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(`images/${episodeId}/${imageUUID}.jpg`);

      console.log(`storeImage: Uploading image images/${episodeId}/${imageUUID}.jpg to ${bucketName}.`);

      // Pipe the image data to the file
      const writeStream = file.createWriteStream({
        gzip: true,
        metadata: {
          cacheControl: 'public, max-age=31536000',
        },
      });

      response.body.pipe(writeStream);

      // Wait for the upload to complete
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      console.log(`StoreImage: Image ${episodeId}_${imageUUID}.jpg uploaded to ${bucketName}.`);

      res.status(200).json({ message: 'Image stored successfully' });
    } else {
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  });
}