// pages/api/mediastack.ts

import { NextApiRequest, NextApiResponse } from 'next';

const mediastackApiKey = process.env.MEDIASTACK_API_KEY;

const debug = process.env.DEBUG || false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { offset = 0, sort = '', category = '', keywords = '' } = req.query; // Get the offset from the query parameters

  if (!mediastackApiKey) {
    res.status(500).json({ error: 'The Mediastack API key is not set' });
  }

  switch (method) {
    case 'GET':
      try {
        let url = `http://api.mediastack.com/v1/news?access_key=${mediastackApiKey}&languages=en&offset=${offset}&sort=${sort}&limit=100`;
        if (category != '') {
          console.log(`News Feed Categories: ${category}`);
          url += `&categories=${category}`;
        }
        if (keywords != '') {
          console.log(`News Feed Keywords: '${keywords}'`);
          url += `&keywords=${keywords}`;
        }
        console.log(`News Feed Sort Order: ${sort}`);
        const response = await fetch(url);
        const data = await response.json();
        if (debug) {
          console.log(`Mediastack API call for the current news articles... ${JSON.stringify(data)}`)
        }
        res.status(200).json(data);
      } catch (error) {
        res.status(500).json({ error: 'Error fetching data from Mediastack' });
      }
      break;
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}