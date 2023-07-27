import type { NextApiRequest, NextApiResponse } from 'next';
import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET_NAME || '';
const maxResults = 20;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const nextPageToken = req.query.nextPageToken as string | undefined;
    const options: { maxResults: number; pageToken?: string; prefix: string } = {
      maxResults,
      prefix: 'stories/', // Only get files in the 'stories' directory
    };
    if (nextPageToken) {
      options.pageToken = nextPageToken;
    }

    const [files, newNextPageToken] = await storage.bucket(bucketName).getFiles(options);

    const stories = [];
    for (const file of files) {
      try {
        // Only process 'data.json' files
        if (file.name.endsWith('/data.json')) {
          const [storyData] = await file.download();
          const story = JSON.parse(storyData.toString());
          stories.push({ id: file.name, ...story });
        }
      } catch (err) {
        console.error(`Error processing file ${file.name}:`, err);
      }
    }

    res.status(200).json({ stories, nextPageToken: newNextPageToken || null });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
