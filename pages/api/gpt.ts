// pages/api/openai.ts

import { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';

const openApiKey: string = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY : '';
const llm = process.env.QUESTION_MODEL_NAME || 'gpt-3.5-turbo';  // faster model for title/question generation
const maxTokens = 60;
const temperature = process.env.TEMPERATURE_STORY !== undefined ? parseFloat(process.env.TEMPERATURE_STORY) : 0.8;
const debug = process.env.DEBUG === 'true' ? true : false;

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

// send a message to the OpenAI API and return the response
async function sendMessageToOpenAI(body: any) {
  const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openApiKey}`,
    },
    body: body,
  })

  return await response.json() as OpenAiResponse;
}

export default async function handler(req: NextApiRequestWithUser, res: NextApiResponse) {
  await authCheck(req, res, async () => {

    const { method } = req;

    switch (method) {
      case 'POST':
        try {
          const { message, prompt, conversationHistory = [] } = req.body;

          let promptArray: any[] = []; // array of messages to send to OpenAI
          promptArray.push({ "role": "system", "content": prompt }); // add system role
          const lastMessages = conversationHistory.slice(-3); // get last 3 messages
          lastMessages.forEach((messageObject: any) => {
            if (messageObject.role && messageObject.content) {
              promptArray.push({ "role": messageObject.role, "content": prompt + messageObject.content });
            }
          });
          promptArray.push({ "role": "user", "content": `Personality: ${prompt}\n\n Task: ${message}\n\nResult:` });

          let body = JSON.stringify({
            model: llm,
            max_tokens: maxTokens > 0 ? maxTokens : null,
            temperature: temperature,
            top_p: 1,
            n: 1,
            stream: false,
            messages: promptArray,
          });

          let data: any = {};
          
          data = await sendMessageToOpenAI(body);

          if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
            const aiMessage = data.choices[0].message;
            if (debug) {
              console.log(`OpenAI GPT: message: ${JSON.stringify(aiMessage)} usage: ${JSON.stringify(data.usage)} finish_reason: ${data.choices[0].finish_reason}\n`);
            }

            if (debug) {
              console.log(`OpenAI GPT: prompt: ${prompt} message: ${message} conversationHistory: ${JSON.stringify(conversationHistory)}\n`);
              console.log(`OpenAI GPT: promptArray: ${JSON.stringify(promptArray)}\n`);
              console.log(`OpenAI GPT: data: ${JSON.stringify(data)}\n`);
            }

            res.status(200).json({ aiMessage });
          } else {
            if (data.error && data.error.type && data.error.type === 'server_error') {
              console.error(`OpenAI GPT: Server error: ${data.error.message}`);
              res.status(500).json({ error: `OpenAI GPT: Server error: ${data.error.message}` });
              return;
            }
            console.error(`OpenAI GPT: No choices returned from OpenAI! data: ${JSON.stringify(data)}`);
            res.status(500).json({ error: 'No choices returned from OpenAI' });
            return;
          }

        } catch (error) {
          console.error('OpenAI GPT: An error occurred:', error);
          res.status(500).json({ error: 'An error occurred while processing your request' });
          return;
        }
        break;

      default:
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${method} Not Allowed`);
        return;
    }
  });
}
