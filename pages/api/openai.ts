import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';

const openaiHandler = async (req: NextApiRequestWithUser, res: NextApiResponse) => {
  await authCheck(req, res, async () => {
    if (req.method === 'POST') {
      const { prompt } = req.body;

      let width: string = process.env.DEEPAI_WIDTH || '512';
      let height: string = process.env.DEEPAI_HEIGHT || '512';
      const n: number = 1;

      if (parseInt(height) != 256 && parseInt(height) != 512 && parseInt(height) != 1024) {
        console.log(`openaiHandler: Invalid height ${height}, must be 256, 512, or 1024`);
        height = '512';
      }
      if (parseInt(width) != 256 && parseInt(width) != 512 && parseInt(width) != 1024) {
        console.log(`openaiHandler: Invalid width ${width}, must be 256, 512, or 1024`);
        width = '512';
      }
      if (parseInt(width) != parseInt(height)) {
        console.log(`openaiHandler: Invalid width ${width} and height ${height}, must be the same`);
        width = '512';
        height = '512';
      }
      const size: string = `${width}x${height}`;
      console.log(`openaiHandler: Generating image with size ${size} from prompt: ${prompt} n: ${n}`);

      try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({ prompt, n, size }),
        });

        if (!response.ok) {
          const textBody = await response.text();
          throw new Error(`OpenAI API Image Generation request failed with status: ${response.status}, message: '${response.statusText}', body: '${textBody}'`);
        }

        const data: any = await response.json();
        console.log(`openaiHandler: OpenAI API response: ${JSON.stringify(data)}`);
        console.log(`openaiHandler: data.data type: ${typeof data.data}`);

        if (!Array.isArray(data.data) || data.data.length === 0 || !data.data[0].url) {
          throw new Error(`No 'data' field in the OpenAI API response or the 'data' array is empty or the first object does not have a 'url' field`);
        }

        res.status(200).json({ output_url: data.data[0].url });

      } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message });
      }
    } else {
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  });
};

export default openaiHandler;
