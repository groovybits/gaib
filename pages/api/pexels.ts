import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';

const pexelsHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      console.error('Pexels API key not found, [', apiKey,  '] in environment variables ', process.env);
      res.status(500).json({ error: 'Pexels API key not found in environment variables' });
      return;
    }

    const keywords = req.body.keywords;
    const apiUrl = `https://api.pexels.com/v1/search?query=${keywords}&per_page=1&page=1&orientation=landscape&size=small`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': apiKey
        }
      });

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

export default pexelsHandler;
