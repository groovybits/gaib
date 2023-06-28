import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import querystring from 'querystring';

const debug = process.env.DEBUG || false;

const deepaiHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const apiKey = process.env.DEEPAI_API_KEY;
    const gridSize = process.env.DEEPAI_GRID_SIZE || '1';
    const width = process.env.DEEPAI_WIDTH || '360';
    const height = process.env.DEEPAI_HEIGHT || '240';

    if (!apiKey) {
      console.error('ERROR: DeepAI API key not found in environment variables, setup .env with DEEPAI_API_KEY.');
      res.status(500).json({ error: 'DeepAI API key not found in environment variables' });
      return;
    }

    const { prompt, imageUrl } = req.body;

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
};

export default deepaiHandler;