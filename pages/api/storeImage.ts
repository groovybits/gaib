import type { NextApiRequest, NextApiResponse } from 'next';
import { Storage } from '@google-cloud/storage';
import admin, { firestore } from 'firebase-admin';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import nlp from 'compromise';
import Fuse from 'fuse.js';

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
        const { imageUrl, prompt, episodeId } = req.body;

        // Use the compromise library to extract the most important words from the prompt
        let doc = nlp(prompt);
        let keywords = doc.out('array');

        // Limit the keywords array to the first 30 elements
        keywords = keywords.slice(0, 30);

        // Query Firestore for all images
        let imagesSnapshot = await db.collection('images').get();

        // Create an array of image documents
        let images = imagesSnapshot.docs.map(doc => doc.data());

        // Initialize a Fuse.js instance
        let fuse = new Fuse(images, {
            keys: ['keywords'],
            threshold: 0.3, // Adjust this value to control the fuzziness of the match
            includeScore: true
        });

        // Use Fuse.js to find images with matching keywords
        let results = fuse.search(keywords.join(' '));

        // If a matching document is found, return the existing image
        if (results.length > 0) {
            const data = results[0].item;
            console.log('storeImage: Image found in database:', data);
            res.status(200).json({ message: 'Image found in database', url: data.url });
            return;
        }

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
        const imageUUID = uuidv4();
        const file = bucket.file(`deepAIimage/${episodeId}_${imageUUID}.jpg`);

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
        const docRef = db.collection('images').doc(`${episodeId}_${imageUUID}.jpg`);
        await docRef.set({
            episodeId: episodeId.split('_')[0],
            count: episodeId.split('_')[1],
            url: `https://storage.googleapis.com/${bucketName}/deepAIimage/${episodeId}_${imageUUID}.jpg`,
            keywords: keywords,
            created: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.status(200).json({ message: 'Image stored successfully' });
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}