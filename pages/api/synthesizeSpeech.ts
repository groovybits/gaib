// pages/api/synthesizeSpeech.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';


const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  function removeMarkdownAndSpecialSymbols(text: string): string {
    // Remove markdown formatting
    const markdownRegex = /(\*{1,3}|_{1,3}|`{1,3}|~~|\[\[|\]\]|!\[|\]\(|\)|\[[^\]]+\]|<[^>]+>|\d+\.\s|\#+\s)/g;
    const cleanedText = text.replace(markdownRegex, '');
  
    // Remove special symbols (including periods)
    const specialSymbolsRegex = /[@#^&*()":{}|<>]/g;
    const finalText = cleanedText.replace(specialSymbolsRegex, '');
  
    return finalText;
  }  

  let { text, ssmlGender, languageCode, name } = req.body;

  text = removeMarkdownAndSpecialSymbols(text);

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
    client.synthesizeSpeech(request, (err: Error | null | undefined, response: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechResponse | null | undefined ) => {
      if (err) {
        console.error(`Error in synthesizing speech for name: ${name}, languageCode: ${languageCode}, ssmlGender: ${ssmlGender}:`, err);
        console.error(`Request: ${JSON.stringify(request)}`);
        res.status(500).json({ message: 'Error in synthesizing speech' });
      } else {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.status(200).send(response!.audioContent);
      }
    });
  } catch (error) {
    console.error(`Error in synthesizing speech for name: ${name}, languageCode: ${languageCode}, ssmlGender: ${ssmlGender}:`, error);
    console.error(`Request: ${JSON.stringify(request)}`);
    res.status(500).json({ message: 'Error in synthesizing speech' });
  }
};

export default handler;

