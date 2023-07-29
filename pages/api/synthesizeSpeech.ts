// pages/api/synthesizeSpeech.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';
import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME ? process.env.GCS_BUCKET_NAME : "";

const handler = async (req: NextApiRequestWithUser, res: NextApiResponse) => {
  await authCheck(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ message: 'Method not allowed' });
      return;
    }

    let { text, ssmlGender, languageCode, name, audioFile } = req.body;

    text = text.trim();

    if (!text) {
      res.status(400).json({ message: 'Missing text in request body' });
      return;
    }

    // Read the JSON content from the environment variable
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

    if (!credentialsJson) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable is not set');
    }
    const credentialsData = JSON.parse(credentialsJson);

    // Create credentials from the JSON content
    const credentials = {
      client_email: credentialsData.client_email,
      private_key: credentialsData.private_key,
    };

    // Initialize the Text-to-Speech client with the credentials
    const client = new TextToSpeechClient({ credentials });

    const request = {
      input: { text },
      voice: { name: name, languageCode: languageCode, ssmlGender: ssmlGender as protos.google.cloud.texttospeech.v1.SsmlVoiceGender },
      audioConfig: { audioEncoding: 'MP3' as const },
    };

    try {
      client.synthesizeSpeech(request, (err: Error | null | undefined, response: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechResponse | null | undefined) => {
        if (err) {
          console.error(`Error in synthesizing speech for name: ${name}, languageCode: ${languageCode}, ssmlGender: ${ssmlGender}:`, err);
          console.error(`Request: ${JSON.stringify(request)}`);
          res.status(500).json({ message: 'Error in synthesizing speech' });
        } else {
          // If we are saving to a file, we don't need to return the audio
          if (audioFile !== '') {
            // Save the audio to a file in the GCS bucket
            const file = storage.bucket(bucketName).file(audioFile);
            const stream = file.createWriteStream({
              metadata: {
                contentType: 'audio/mpeg',
              },
            });
            stream.on('error', (err) => {
              console.error(`Error in saving audio to file ${audioFile}:`, err);
              res.status(500).json({ message: 'Error in saving audio to file' });
            });
            stream.on('finish', () => {
              console.log(`Saved audio to file ${audioFile}`);
              res.status(200).json({ message: 'Saved audio to file' });
            });
            stream.end(response!.audioContent);
            return;
          }

          // Return the binary audio content
          res.setHeader('Content-Type', 'audio/mpeg');
          res.status(200).send(response!.audioContent);
        }
      });
    } catch (error) {
      console.error(`Error in synthesizing speech for name: ${name}, languageCode: ${languageCode}, ssmlGender: ${ssmlGender}:`, error);
      console.error(`Request: ${JSON.stringify(request)}`);
      res.status(500).json({ message: 'Error in synthesizing speech' });
    }
  });
};

export default handler;

