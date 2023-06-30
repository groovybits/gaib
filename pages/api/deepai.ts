import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import querystring from 'querystring';
import admin, { firestore } from 'firebase-admin';
import nlp from 'compromise';
import Fuse from 'fuse.js';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';

const debug = process.env.DEBUG || false;

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const db = admin.firestore();

const deepaiHandler = async (req: NextApiRequestWithUser, res: NextApiResponse) => {
  await authCheck(req, res, async () => {
    if (req.method === 'POST') {
      const apiKey = process.env.DEEPAI_API_KEY;
      const gridSize = process.env.DEEPAI_GRID_SIZE || '1';
      const width = process.env.DEEPAI_WIDTH || '360';
      const height = process.env.DEEPAI_HEIGHT || '256';

      if (!apiKey) {
        console.error('ERROR: DeepAI API key not found in environment variables, setup .env with DEEPAI_API_KEY.');
        res.status(500).json({ error: 'DeepAI API key not found in environment variables' });
        return;
      }

      const { prompt, imageUrl } = req.body;

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
        res.status(200).json({ ouput_url: data.url });
        return;
      }

      const requestBody: { [key: string]: any } = {
        text: prompt,
        grid_size: gridSize,
        width: width,
        height: height
      };

      if (imageUrl !== '') {
        requestBody['image_url'] = imageUrl;
      }

      if (debug) {
        console.log('DeepAIimage: Sending request to DeepAI API with body:', requestBody);
      }

      try {
        const response = await fetch(
          'https://api.deepai.org/api/text2img',
          {
            method: 'POST',
            headers: {
              'api-key': apiKey,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: querystring.stringify(requestBody),
          }
        );

        if (!response.ok) {
          throw new Error(`API request failed with status: ${response.status}, message: '${response.statusText}', body: '${JSON.stringify(response.body)}'`);
        }

        const data = await response.json();
        res.status(200).json(data);
      } catch (error) {
        console.error('Error fetching image from API:', error);
        res.status(500).json({ error: 'Error fetching image from API' });
      }
    } else {
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  });
};

export default deepaiHandler;