import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import { Storage } from '@google-cloud/storage';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';
import { v4 as uuidv4 } from 'uuid';

const debug = process.env.DEBUG ? process.env.DEBUG === 'true' : false;

export default async function handler(req: NextApiRequestWithUser, res: NextApiResponse) {
  await authCheck(req, res, async () => {
    if (req.method === 'POST') {
      const { model, prompt, negativePrompt, width, height, steps, guidance, seed, scheduler, outputFormat } = req.body;

      if (!process.env.GETIMGAI_API_KEY) {
        console.error('getimgaiHandler: GETIMGAI_API_KEY not set');
        res.status(500).json({ error: 'GETIMGAI_API_KEY not set' });
        return;
      }

      // print out the variables input to show what settings we have, in one output cmd
      if (debug) {
        console.log(`getimgaiHandler: model: ${model}\nprompt: ${prompt}\nnegativePrompt: ${negativePrompt}\nwidth: ${width}\nheight: ${height}\nsteps: ${steps}\nguidance: ${guidance}\nseed: ${seed}\nscheduler: ${scheduler}\noutputFormat: ${outputFormat}`);
      }

      let getImgResponse: any;
      try {
        getImgResponse = await fetch('https://api.getimg.ai/v1/stable-diffusion/text-to-image', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GETIMGAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            prompt,
            negative_prompt: negativePrompt,
            width,
            height,
            steps,
            guidance,
            seed,
            scheduler,
            output_format: outputFormat,
          }),
        });
      } catch (error: any) {
        console.error(`getimgaiHandler: Error calling getimg.ai API: ${error.message}`);
        throw new Error(`getimgaiHandler: Error calling getimg.ai API: ${error.message}`);
      }

      // Get the image data from the response
      if (getImgResponse === undefined) {
        console.error(`getimgaiHandler: Error calling getimg.ai API, undefined: ${getImgResponse ? getImgResponse.statusText : 'undefined error'}`);
        throw new Error(`getimgaiHandler: Error calling getimg.ai API, undefined: ${getImgResponse ? getImgResponse.statusText : 'undefined error'}`);
      }
      let getImgData;
      try {
        getImgData = await getImgResponse.json() as { image: string; seed: number };
      } catch (error: any) {
        console.error(`getimgaiHandler: Error parsing getimg.ai API response, .json(): ${error.message}`);
        throw new Error(`getimgaiHandler: Error parsing getimg.ai API response, .json(): ${error.message}`);
      }

      if (!getImgData.image) {
        console.error(`getimgaiHandler: Error calling getimg.ai API, missing .image: ${getImgData}`);
        throw new Error(`getimgaiHandler: Error calling getimg.ai API, mising .image: ${getImgData}`);
      }
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
        if (debug) {
          console.log(`getimgaiHandler: Successfully uploaded image to GCS: ${destination}`);
        }
        const outputUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;

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
