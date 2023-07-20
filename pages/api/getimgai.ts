import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import { Storage } from '@google-cloud/storage';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';
import { v4 as uuidv4 } from 'uuid';
import admin from 'firebase-admin';

export default async function handler(req: NextApiRequestWithUser, res: NextApiResponse) {
  await authCheck(req, res, async () => {
    if (req.method === 'POST') {
      const { prompt, negativePrompt, width, height, steps, guidance, seed, scheduler, outputFormat } = req.body;

      if (!process.env.GETIMGAI_API_KEY) {
        console.error('getimgaiHandler: GETIMGAI_API_KEY not set');
        res.status(500).json({ error: 'GETIMGAI_API_KEY not set' });
        return;
      }

      const getImgResponse = await fetch('https://api.getimg.ai/v1/stable-diffusion/text-to-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GETIMGAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'stable-diffusion-v1-5',
          prompt,
          negativePrompt,
          width,
          height,
          steps,
          guidance,
          seed,
          scheduler,
          outputFormat,
        }),
      });

      const getImgData = await getImgResponse.json() as { image: string; seed: number };

      const imageBuffer = Buffer.from(getImgData.image, 'base64');

      // Prepare the GCS client
      const storage = new Storage();
      const bucketName = process.env.GCS_BUCKET_NAME ? process.env.GCS_BUCKET_NAME : '';
      const bucket = storage.bucket(bucketName);

      // Prepare the image filename and destination path
      const episodeId = uuidv4();
      const imageUUID = uuidv4();
      const imageName = `${episodeId}_${imageUUID}.${outputFormat}`;
      const destination = `getimgai/${imageName}`;

      // Create a GCS file instance
      const file = bucket.file(destination);

      // Stream the image data to the GCS file
      const stream = file.createWriteStream({
        metadata: { contentType: `image/${outputFormat}` },
      });

      stream.on('error', (err) => {
        console.error(`getimgaiHandler: Error uploading image to GCS: ${err.message}`);
        res.status(500).json({ error: 'Failed to upload image' });
      });

      stream.on('finish', async () => {
        console.log(`getimgaiHandler: Successfully uploaded image to GCS: ${destination}`);
        const outputUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;

        // Add the image document to Firestore
        const db = admin.firestore();
        const imagesRef = db.collection('images');
        const imageDoc = {
          imageUrl: outputUrl,
          prompt: prompt,
          episodeId: episodeId,
          timestamp: admin.firestore.Timestamp.now(),
        };
        await imagesRef.add(imageDoc);
        console.log(`getimgaiHandler: Successfully added image document to Firestore`);

        // Include the imageName in the response
        res.status(200).json({ output_url: outputUrl, imageName: imageName });
      });
      stream.end(imageBuffer);
    } else {
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  });
}
