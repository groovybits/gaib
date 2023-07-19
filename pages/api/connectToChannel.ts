import type { NextApiRequest, NextApiResponse } from 'next';
import { spawn } from 'child_process';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // Parse the user ID and channel name from the request body
    const { userId, channelName } = req.body;

    // Start a new instance of the server-side process for this channel
    const child = spawn('ts-node', ['twitchChat.ts', channelName]);

    child.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    child.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    child.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
    });

    // Send a response
    res.status(200).json({ status: 'ok' });
  } else {
    res.status(405).json({ error: 'Invalid request method' });
  }
}
