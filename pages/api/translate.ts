import type { NextApiRequest, NextApiResponse } from 'next';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';

const fetchTranslation = async (text: string, targetLanguage: string): Promise<string> => {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  const apiUrl = 'https://translation.googleapis.com/language/translate/v2?key=' + apiKey;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, target: targetLanguage }),
  });

  if (!response.ok) {
    const errorResponse = await response.json();
    console.log("Google Translate API error response:", errorResponse);
    throw new Error('Error in translating text, statusText: ' + response.statusText);
  }  

  const data = await response.json();
  return data.data.translations[0].translatedText;
};

const translateHandler = async (req: NextApiRequestWithUser, res: NextApiResponse) => {
  await authCheck(req, res, async () => {
  if (req.method === 'POST') {
    const { text, targetLanguage } = req.body;

    try {
      const translatedText = await fetchTranslation(text, targetLanguage);
      res.status(200).json({ translatedText });
    } catch (error : any) {
      console.log("Error connecting to Google Text Translation", error);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
  });
};
export default translateHandler;
