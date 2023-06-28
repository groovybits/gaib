import type { NextApiRequest, NextApiResponse } from 'next';
import { Storage } from '@google-cloud/storage';
import admin from 'firebase-admin';
import fetch from 'node-fetch';

// Initialize Firebase
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}

const db = admin.firestore();
const storage = new Storage();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        const { imageUrl, imageName, prompt } = req.body;

        // Fetch the image
        const response = await fetch(imageUrl);

        if (!response.ok) {
            console.error('Error fetching image:', response.statusText);
            res.status(500).json({ error: 'Error fetching image' });
            return;
        }

        if (!response.body) {
            console.error('No body in response');
            res.status(500).json({ error: 'No body in response' });
            return;
        }

        // Create a new blob in the bucket and upload the file data
        const bucketName = process.env.GCS_BUCKET_NAME || '';
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(`deepAIimage/${imageName}`);

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

        // Add the image to the Firestore index
        const docRef = db.collection('images').doc(prompt);
        await docRef.set({
            url: `https://storage.googleapis.com/${bucketName}/deepAIimage/${imageName}`
        });

        res.status(200).json({ message: 'Image stored successfully' });
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}