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
    const specialSymbolsRegex = /[!@#$%^&*(),.?":{}|<>]/g;
    const finalText = cleanedText.replace(specialSymbolsRegex, '');
  
    return finalText;
  }  

  let { text } = req.body;

  text = removeMarkdownAndSpecialSymbols(text);

  if (!text) {
    res.status(400).json({ message: 'Missing text in request body' });
    return;
  }

  const client = new TextToSpeechClient();

  const request = {
    input: { text },
    voice: { languageCode: 'en-US', ssmlGender: 'FEMALE' as const },
    audioConfig: { audioEncoding: 'MP3' as const },
  };

  try {
    client.synthesizeSpeech(request, (err: Error | null | undefined, response: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechResponse | null | undefined ) => {
      if (err) {
        console.error('Error in synthesizing speech:', err);
        res.status(500).json({ message: 'Error in synthesizing speech' });
      } else {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.status(200).send(response!.audioContent);
      }
    });
  } catch (error) {
    console.error('Error in synthesizing speech:', error);
    res.status(500).json({ message: 'Error in synthesizing speech' });
  }
};

export default handler;

