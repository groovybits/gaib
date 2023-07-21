// pages/api/openai.ts

import { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';

const openApiKey: string = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY : '';
const llm = process.env.QUESTION_MODEL_NAME || 'gpt-3.5-turbo-16k';  // faster model for title/question generation
const maxTokens = 0;
const temperature = process.env.TEMPERATURE_QUESTION !== undefined ? parseFloat(process.env.TEMPERATURE_QUESTION) : 0.0;;

interface Message {
  role: string;
  content: string;
}

interface Choice {
  message: Message;
  finish_reason: string;
}

interface OpenAiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  choices: Choice[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case 'POST':
      try {
        const { message, conversationHistory = [] } = req.body;
        let lastMessageArray: any[] = conversationHistory;

        const prompt: string = `As GAIB, provide useful, personable assistance...`; // Please replace with your actual prompt.
        lastMessageArray.push({ "role": "system", "content": prompt });

        let promptArray: any[] = [];
        lastMessageArray.forEach((messageObject: any) => {
          if (messageObject.role && messageObject.content) {
            promptArray.push({ "role": messageObject.role, "content": prompt + messageObject.content });
          }
        });

        promptArray.push({ "role": "user", "content": `Personality: ${prompt}\n\n Question: ${message}\n\nAnswer:` });

        const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openApiKey}`,
          },
          body: JSON.stringify({
            model: llm,
            max_tokens: maxTokens > 0 ? maxTokens : null,
            temperature: temperature,
            top_p: 1,
            n: 1,
            stream: false,
            messages: promptArray,
          }),
        })

        const data = await response.json() as OpenAiResponse;

        if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
          const aiMessage = data.choices[0].message;
          console.log(`OpenAI response:\n${JSON.stringify(aiMessage)}\n`);
          console.log(`OpenAI usage:\n${JSON.stringify(data.usage)}\nfinish_reason: ${data.choices[0].finish_reason}\n`);
          lastMessageArray.push({ aiMessage });

          res.status(200).json({ aiMessage, conversationHistory: lastMessageArray });
        } else {
          console.error('No choices returned from OpenAI!\n');
          console.log(`OpenAI response:\n${JSON.stringify(data)}\n`);
          res.status(500).json({ error: 'No choices returned from OpenAI' });
        }

      } catch (error) {
        console.error('An error occurred:', error);
        res.status(500).json({ error: 'An error occurred while processing your request' });
      }
      break;

    default:
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
