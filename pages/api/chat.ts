import type { NextApiResponse } from 'next';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { makeChain } from '@/utils/makechain';
import { pinecone } from '@/utils/pinecone-client';
import path from 'path';
import {
  PINECONE_INDEX_NAME,
  PINECONE_NAME_SPACE,
  OTHER_PINECONE_NAMESPACES,
} from '@/config/pinecone';
import GPT3Tokenizer from 'gpt3-tokenizer';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';
import { BaseMessage, HumanMessage, AIMessage } from 'langchain/schema';
import {
  buildPrompt,
  buildCondensePrompt,
} from '@/config/personalityPrompts';
import { Scene, Sentence } from '@/types/story';
import fetch from 'node-fetch';
import { Storage } from '@google-cloud/storage';
import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import nlp from 'compromise';

const tokenizer = new GPT3Tokenizer({ type: 'gpt3' });
const debug = process.env.DEBUG ? Boolean(process.env.DEBUG) : false;
const sendReferences = process.env.SEND_REFERENCES ? Boolean(process.env.SEND_REFERENCES) : false;
const getimgaiApiKey = process.env.GETIMGAI_API_KEY ? process.env.GETIMGAI_API_KEY : '';
const bucketName = process.env.GCS_BUCKET_NAME ? process.env.GCS_BUCKET_NAME : '';

let model = process.env.NEXT_PUBLIC_GETIMGAI_MODEL || 'stable-diffusion-v2-1';
let negativePrompt = process.env.NEXT_PUBLIC_GETIMGAI_NEGATIVE_PROMPT || 'blurry, cropped, watermark, unclear, illegible, deformed, jpeg artifacts, writing, letters, numbers, cluttered';
let width = process.env.NEXT_PUBLIC_GETIMGAI_WIDTH ? parseInt(process.env.NEXT_PUBLIC_GETIMGAI_WIDTH) : 512;
let height = process.env.NEXT_PUBLIC_GETIMGAI_HEIGHT ? parseInt(process.env.NEXT_PUBLIC_GETIMGAI_HEIGHT) : 512;
let steps = process.env.NEXT_PUBLIC_GETIMGAI_STEPS ? parseInt(process.env.NEXT_PUBLIC_GETIMGAI_STEPS) : 25;
let guidance = process.env.NEXT_PUBLIC_GETIMGAI_GUIDANCE ? parseFloat(process.env.NEXT_PUBLIC_GETIMGAI_GUIDANCE) : 7.5;
let seed = process.env.NEXT_PUBLIC_GETIMGAI_SEED ? parseInt(process.env.NEXT_PUBLIC_GETIMGAI_SEED) : 42;
let scheduler = process.env.NEXT_PUBLIC_GETIMGAI_SCHEDULER || 'dpmsolver++';
let outputFormat = process.env.NEXT_PUBLIC_GETIMGAI_OUTPUT_FORMAT || 'jpeg';

let genderMarkedNames: any[] = [];
let voiceModels: { [key: string]: string } = {};

async function generateImageAndStory(prompt: string, episodeId: string, imageUUID: string): Promise<string> {
  // print out the variables input to show what settings we have, in one output cmd
  if (true || debug) {
    console.log(`generateImageAndStory: model: ${model}
    prompt: ${prompt}
    negativePrompt: ${negativePrompt}
    width: ${width}\
    eight: ${height}
    steps: ${steps}
    guidance: ${guidance}
    seed: ${seed}
    scheduler: ${scheduler}
    outputFormat: ${outputFormat}`);
  }

  if (prompt === undefined || prompt === '') {
    console.error(`generateImageAndStory: Error, prompt is undefined or empty: ${prompt}`);
    return '';
  }

  let requestBody = JSON.stringify({
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
  })

  let getImgResponse: any;
  try {
    getImgResponse = await fetch('https://api.getimg.ai/v1/stable-diffusion/text-to-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getimgaiApiKey}`,
      },
      body: requestBody,
    });
  } catch (error: any) {
    console.error(`getimgaiChat: Error calling getimg.ai API: ${error.message}`);
    return '';
  }

  // Get the image data from the response
  if (getImgResponse === undefined) {
    console.error(`getimgaiChat: Error calling getimg.ai API, undefined: ${getImgResponse ? getImgResponse.statusText : 'undefined error'}`);
    return '';
  }
  let getImgData;
  try {
    getImgData = await getImgResponse.json() as { image: string; seed: number };
  } catch (error: any) {
    console.error(`getimgaiChat: Error parsing getimg.ai API response, .json(): ${error.message}`);
    return '';
  }

  try {
    if (getImgData && !getImgData.image) {
      console.error(`getimgaiChat: Error with API using RequestBody: ${JSON.stringify(requestBody, null, 2)}`);
      console.error(`getimgaiChat: Error with API, missing .image in getImgData: ${JSON.stringify(getImgData, null, 2)}`);
      throw new Error(`getimgaiChat: Error calling getimg.ai API, missing .image`);
    }
  } catch (error: any) {
    console.error(`getimgaiChat: Error calling getimg.ai API, missing .image: ${error.message}`);
    return '';
  }
  const imageBuffer = Buffer.from(getImgData.image, 'base64');

  // Prepare the GCS client
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);

  // Prepare the image filename and destination path
  const destination = `stories/${episodeId}/images/${imageUUID}.${outputFormat}`;
  let imageUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;

  // Create a GCS file instance
  const file = bucket.file(destination);

  // Stream the image data to the GCS file
  const stream = file.createWriteStream({
    metadata: { contentType: `image/${outputFormat}` },
  });

  stream.on('error', (err) => {
    console.error(`getimgaiChat: Error uploading image to GCS: ${err.message}`);
    imageUrl = '';
  });

  stream.on('finish', async () => {
    console.log(`getimgaiChat: Successfully uploaded image to GCS: ${destination}`);
  });
  stream.end(imageBuffer);
  return imageUrl;
}

async function generateTextToSpeechMP3(text: string, episodeId: string, imageUUID: string, ssmlGender: any, languageCode: string, name: string): Promise<string> {
  text = text.trim();
  const storage = new Storage();

  if (!text) {
    throw new Error('generateTextToSpeechMP3: text is empty');
  }

  if (episodeId === undefined) {
    throw new Error('generateTextToSpeechMP3: episodeId is undefined');
  }

  if (imageUUID === undefined) {
    throw new Error('generateTextToSpeechMP3: imageUUID is undefined');
  }

  if (bucketName === undefined || bucketName === '') {
    throw new Error('generateTextToSpeechMP3: bucketName is undefined');
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

  return new Promise((resolve, reject) => {
    try {
      client.synthesizeSpeech(request, (err: any, response: any) => {
        if (err) {
          console.error(`generateTextToSpeechMP3: Error in synthesizing speech for name: ${name}, languageCode: ${languageCode}, ssmlGender: ${ssmlGender}:`, err);
          console.error(`generateTextToSpeechMP3: Request: ${JSON.stringify(request)}`);
          reject('');
        } else {
          // Save the audio to a file in the GCS bucket
          let audioPath = `stories/${episodeId}/audio/${imageUUID}.mp3`;
          const file = storage.bucket(bucketName).file(audioPath);
          const stream = file.createWriteStream({
            metadata: {
              contentType: 'audio/mpeg',
            },
          });

          stream.on('error', (err) => {
            console.error(`generateTextToSpeechMP3: Error in saving audio to file ${audioPath}:`, err);
            reject('');
          });

          stream.on('finish', () => {
            console.log(`generateTextToSpeechMP3: Saved audio to file ${audioPath}`);
            const audioFile = `https://storage.googleapis.com/${bucketName}/${audioPath}`;
            resolve(audioFile);
          });

          stream.end(response!.audioContent);
        }
      });
    } catch (error) {
      console.error(`generateTextToSpeechMP3: Error in synthesizing speech for name: ${name}, languageCode: ${languageCode}, ssmlGender: ${ssmlGender}:`, error);
      console.error(`generateTextToSpeechMP3: Request ${JSON.stringify(request)}`);
      reject('');
    }
  });
}

function countTokens(textString: string): number {
  let totalTokens = 0;

  const encoded = tokenizer.encode(textString);
  totalTokens += encoded.bpe.length;

  return totalTokens;
}

function removeMarkdownAndSpecialSymbols(text: string): string {
  // handle SCENE markers
  if (text.includes('SCENE:')) {
    return text.replace('[', '').replace(']', '').replace('SCENE:', '');
  }

  // Remove markdown formatting
  const markdownRegex = /(\*{1,3}|_{1,3}|`{1,3}|~~|\[\[|\]\]|!\[|\]\(|\)|\[[^\]]+\]|<[^>]+>|\d+\.\s|\#+\s)/g;
  let cleanedText = text.replace(markdownRegex, '');

  // remove any lines of just dashes like --- or ===
  const dashRegex = /^[-=]{3,}$/g;
  cleanedText = cleanedText.replace(dashRegex, '');

  // Remove special symbols (including periods)
  const specialSymbolsRegex = /[@#^&*()":{}|<>]/g;
  const finalText = cleanedText.replace(specialSymbolsRegex, '');

  return finalText;
}

async function translateText(text: string, targetLanguage: string): Promise<string> {
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

    const data: any = await response.json();
    if (data && data.data && data.data.translations && data.data.translations[0] && data.data.translations[0].translatedText) {
      return data.data.translations[0].translatedText;
    } else {
      console.log(`Google Translate API error with empty text response: ${response.statusText} ${JSON.stringify(data)}`);
      throw new Error('Error in translating text, statusText: ' + response.statusText);
    }
  };

  return await fetchTranslation(text, targetLanguage);
}

async function buildGenderMap(gender: string, audioLanguage: string, message: string): Promise<void> {
  let currentSpeaker: string = 'groovy';
  let isContinuingToSpeak = false;
  let isSceneChange = false;
  let lastSpeaker = '';
  let detectedGender = '';

  let maleVoiceModels = {
    'en-US': ['en-US-Wavenet-A', 'en-US-Wavenet-B', 'en-US-Wavenet-D', 'en-US-Wavenet-I', 'en-US-Wavenet-J'],
    'ja-JP': ['ja-JP-Wavenet-C', 'ja-JP-Wavenet-D', 'ja-JP-Standard-C', 'ja-JP-Standard-D'],
    'es-US': ['es-US-Wavenet-B', 'es-US-Wavenet-C', 'es-US-Wavenet-B', 'es-US-Wavenet-C'],
    'en-GB': ['en-GB-Wavenet-B', 'en-GB-Wavenet-D', 'en-GB-Wavenet-B', 'en-GB-Wavenet-D']
  };

  let femaleVoiceModels = {
    'en-US': ['en-US-Wavenet-C', 'en-US-Wavenet-F', 'en-US-Wavenet-G', 'en-US-Wavenet-H', 'en-US-Wavenet-E'],
    'ja-JP': ['ja-JP-Wavenet-A', 'ja-JP-Wavenet-B', 'ja-JP-Standard-A', 'ja-JP-Standard-B'],
    'es-US': ['es-US-Wavenet-A', 'es-US-Wavenet-A', 'es-US-Wavenet-A', 'es-US-Wavenet-A'],
    'en-GB': ['en-GB-Wavenet-A', 'en-GB-Wavenet-C', 'en-GB-Wavenet-F', 'en-GB-Wavenet-A']
  };

  let neutralVoiceModels = {
    'en-US': ['en-US-Wavenet-C', 'en-US-Wavenet-F', 'en-US-Wavenet-G', 'en-US-Wavenet-H', 'en-US-Wavenet-E'],
    'ja-JP': ['ja-JP-Wavenet-A', 'ja-JP-Wavenet-B', 'ja-JP-Standard-A', 'ja-JP-Standard-B'],
    'es-US': ['es-US-Wavenet-A', 'es-US-Wavenet-A', 'es-US-Wavenet-A', 'es-US-Wavenet-A'],
    'en-GB': ['en-GB-Wavenet-A', 'en-GB-Wavenet-C', 'en-GB-Wavenet-F', 'en-GB-Wavenet-A']
  };

  let defaultModels = {
    'en-US': 'en-US-Wavenet-C',
    'ja-JP': 'ja-JP-Wavenet-A',
    'es-US': 'es-US-Wavenet-A',
    'en-GB': 'en-GB-Wavenet-A'
  };

  if (gender == `MALE`) {
    defaultModels = {
      'en-US': 'en-US-Wavenet-A',
      'ja-JP': 'ja-JP-Wavenet-C',
      'es-US': 'es-US-Wavenet-B',
      'en-GB': 'en-GB-Wavenet-B'
    };
  }
  // Define default voice model for language
  let defaultModel = audioLanguage in defaultModels ? defaultModels[audioLanguage as keyof typeof defaultModels] : "";
  let model = defaultModel;

  // Extract gender markers from the entire message
  const genderMarkerMatches = message.match(/(\w+)\s*\[(f|m|n|F|M|N)\]|(\w+):\s*\[(f|m|n|F|M|N)\]/gi);
  if (genderMarkerMatches) {
    let name: string;
    for (const match of genderMarkerMatches) {
      const marker = match.slice(match.indexOf('[') + 1, match.indexOf(']')).toLowerCase();
      if (match.includes(':')) {
        name = match.slice(0, match.indexOf(':')).trim().toLowerCase();
      } else {
        name = match.slice(0, match.indexOf('[')).trim().toLowerCase();
      }

      // check if name is already setup
      if (name in voiceModels) {
        continue;
      }
      genderMarkedNames.push({ name, marker });

      // Assign a voice model to the name
      if (marker === 'm' && !voiceModels[name]) {
        if (maleVoiceModels[audioLanguage as keyof typeof maleVoiceModels].length > 0) {
          voiceModels[name] = maleVoiceModels[audioLanguage as keyof typeof maleVoiceModels].shift() as string;
          maleVoiceModels[audioLanguage as keyof typeof maleVoiceModels].push(voiceModels[name]);
        }
      } else if ((marker == 'n' || marker === 'f') && !voiceModels[name]) {
        if (femaleVoiceModels[audioLanguage as keyof typeof femaleVoiceModels].length > 0) {
          voiceModels[name] = femaleVoiceModels[audioLanguage as keyof typeof femaleVoiceModels].shift() as string;
          femaleVoiceModels[audioLanguage as keyof typeof femaleVoiceModels].push(voiceModels[name]);
        }
      } else if (!voiceModels[name]) {
        if (neutralVoiceModels[audioLanguage as keyof typeof neutralVoiceModels].length > 0) {
          voiceModels[name] = neutralVoiceModels[audioLanguage as keyof typeof neutralVoiceModels].shift() as string;
          neutralVoiceModels[audioLanguage as keyof typeof neutralVoiceModels].push(voiceModels[name]);
        }
      }
    }
  }

  if (debug) {
    console.log(`Response Speaker map: ${JSON.stringify(voiceModels)}`);
    console.log(`Gender Marked Names: ${JSON.stringify(genderMarkedNames)}`);
  }
}

function processSpeakerChange(sentence_by_character: string, context: {
  voiceModels: any,
  genderMarkedNames: any,
  gender: string,
  defaultModel: string,
  audioLanguage: string,
  currentSpeaker: string,
  lastSpeaker: string,
  isContinuingToSpeak: boolean,
  isSceneChange: boolean,
}) {
  let { currentSpeaker, lastSpeaker, isContinuingToSpeak, isSceneChange, genderMarkedNames, defaultModel, gender, voiceModels, audioLanguage } = context;
  let speakerChanged = false;
  let detectedGender = '';
  let model = '';

  // Check if sentence contains a name from genderMarkedNames
  for (const { name, marker } of genderMarkedNames) {
    const lcSentence = sentence_by_character.toLowerCase();
    let nameFound = false;

    const regprefixes = [':', ' \\(', '\\[', '\\*:', ':\\*', '\\*\\*:', '\\*\\*\\[', ' \\['];
    const prefixes = [':', ' (', '[', '*:', ':*', '**:', '**[', ' ['];
    for (const prefix of prefixes) {
      if (lcSentence.startsWith(name + prefix)) {
        nameFound = true;
        break;
      }
    }
    for (const prefix of regprefixes) {
      if (nameFound) {
        break;
      }
      if (lcSentence.match(new RegExp(`\\b\\w*\\s${name}${prefix}`))) {
        nameFound = true;
        break;
      }
    }

    if (nameFound) {
      console.log(`Detected speaker: ${name}, gender marker: ${marker}`);
      if (currentSpeaker !== name) {
        lastSpeaker = currentSpeaker;
        speakerChanged = true;
        currentSpeaker = name;
        isContinuingToSpeak = false; // New speaker detected, so set isContinuingToSpeak to false
      }
      switch (marker) {
        case 'f':
          detectedGender = 'FEMALE';
          break;
        case 'm':
          detectedGender = 'MALE';
          break;
        case 'n':
          detectedGender = 'FEMALE';
          break;
      }
      // Use the voice model for the character if it exists, otherwise use the default voice model
      model = voiceModels[name] || defaultModel;
      break; // Exit the loop as soon as a name is found
    }
  }

  if (debug) {
    console.log(`Using voice model: ${model} for ${currentSpeaker} - ${detectedGender} in ${audioLanguage} language`);
  }

  // If the speaker has changed or if it's a scene change, switch back to the default voice
  if (!speakerChanged && (sentence_by_character.startsWith('*') || sentence_by_character.startsWith('-'))) {
    detectedGender = gender;
    currentSpeaker = 'groovy';
    model = defaultModel;
    console.log(`Switched back to default voice. Gender: ${detectedGender}, Model: ${model}`);
    isSceneChange = true; // Reset the scene change flag
  }

  // If the sentence starts with a parenthetical action or emotion, the speaker is continuing to speak
  if (sentence_by_character.startsWith('(') || (!sentence_by_character.startsWith('*') && !speakerChanged && !isSceneChange)) {
    isContinuingToSpeak = true;
  }

  return {
    currentSpeaker,
    detectedGender,
    model,
    lastSpeaker,
    isContinuingToSpeak,
    isSceneChange,
  };
}

async function getValidNamespace(namespaces: any) {
  const describeIndexStatsQuery = {
    describeIndexStatsRequest: {
      filter: {},
    },
  };

  try {
    const index = pinecone.Index(PINECONE_INDEX_NAME);
    const indexStatsResponse = await index.describeIndexStats(describeIndexStatsQuery);
    const namespaceStats = indexStatsResponse.namespaces;

    if (!namespaceStats) {
      console.error('getValidNamespace: No namespace stats found from Pinecone from [', namespaces, ']');
      return null;
    }

    for (const namespace of namespaces) {
      if (!namespace || namespace.length === 0 || namespace === 'undefined') {
        continue;
      }

      const vectorCount = namespaceStats[namespace]?.vectorCount || 0;

      if (vectorCount > 0) {
        console.log('Found valid namespace:', namespace, 'with', vectorCount, 'vectors');
        const tempVectorStore = await PineconeStore.fromExistingIndex(new OpenAIEmbeddings({}), {
          pineconeIndex: index,
          textKey: 'text',
          namespace,
        });

        return {
          validNamespace: namespace,
          vectorStore: tempVectorStore,
        };
      }
    }
  } catch (error) {
    console.error('Error fetching index statistics from Pinecone:', JSON.stringify(error));
  }

  console.error('No valid namespace found from:', namespaces);
  return null;
}

export default async function handler(req: NextApiRequestWithUser, res: NextApiResponse) {
  await authCheck(req, res, async () => {
    // Set the CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    const {
      episodeId,
      question,
      userId,
      localPersonality,
      selectedNamespace,
      isStory,
      customPrompt,
      condensePrompt,
      commandPrompt,
      modelName,
      fastModelName,
      tokensCount,
      documentCount,
      episodeCount,
      titleArray,
      history,
      gender,
      speakingLanguage,
      subtitleLanguage,
    } = req.body;

    if (episodeId === undefined) {
      console.error('ChatAPI: No episodeId in the request');
      res.status(400).json({ error: 'No episodeId in the request' });
      return;
    }

    if (getimgaiApiKey === '') {
      console.error('ChatAPI: GETIMGAI_API_KEY not set');
      res.status(500).json({ error: 'GETIMGAI_API_KEY not set' });
      return;
    }

    // check each input to confirm it is valid and not undefined
    if (question === undefined) {
      console.error('ChatAPI: No question in the request');
      res.status(400).json({ error: 'No question in the request' });
      return;
    }
    if (userId === undefined) {
      console.error('ChatAPI: No userId in the request');
      res.status(400).json({ error: 'No userId in the request' });
      return;
    }
    if (localPersonality === undefined) {
      console.error('ChatAPI: No localPersonality in the request');
      res.status(400).json({ error: 'No localPersonality in the request' });
      return;
    }
    if (isStory === undefined) {
      console.error('ChatAPI: No isStory in the request');
      res.status(400).json({ error: 'No isStory in the request' });
      return;
    }
    if (customPrompt === undefined) {
      console.error('ChatAPI: No customPrompt in the request');
      res.status(400).json({ error: 'No customPrompt in the request' });
      return;
    }
    if (commandPrompt === undefined) {
      console.error('ChatAPI: No commandPrompt in the request');
      res.status(400).json({ error: 'No commandPrompt in the request' });
      return;
    }
    if (condensePrompt === undefined) {
      console.error('ChatAPI: No condensePrompt in the request');
      res.status(400).json({ error: 'No condensePrompt in the request' });
      return;
    }
    if (tokensCount === undefined) {
      console.error('ChatAPI: No tokensCount in the request');
      res.status(400).json({ error: 'No tokensCount in the request' });
      return;
    }
    if (documentCount === undefined) {
      console.error('ChatAPI: No documentCount in the request');
      res.status(400).json({ error: 'No documentCount in the request' });
      return;
    }
    if (episodeCount === undefined) {
      console.error('ChatAPI: No episodeCount in the request');
      res.status(400).json({ error: 'No episodeCount in the request' });
      return;
    }
    if (history === undefined) {
      console.error('ChatAPI: No history in the request');
      res.status(400).json({ error: 'No history in the request' });
      return;
    }
    if (selectedNamespace === undefined) {
      console.error('ChatAPI: No selectedNamespace in the request');
      res.status(400).json({ error: 'No selectedNamespace in the request' });
      return;
    }

    //only accept post requests
    if (req.method !== 'POST') {
      console.error(`ChatAPI: Method ${req.method} not allowed`);
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (!question) {
      console.error('No question in the request');
      res.status(400).json({ error: 'No question in the request' });
      return;
    }

    if (!gender) {
      console.error('No gender in the request');
      res.status(400).json({ error: 'No gender in the request' });
      return;
    }

    if (!speakingLanguage) {
      console.error('No speakingLanguage in the request');
      res.status(400).json({ error: 'No speakingLanguage in the request' });
      return;
    }

    if (!subtitleLanguage) {
      console.error('No subtitleLanguage in the request');
      res.status(400).json({ error: 'No subtitleLanguage in the request' });
      return;
    }

    const sendData = (data: string) => {
      res.write(`data: ${data}\n\n`);
    };

    // check if question string starts with the string "REPLAY:" and if so then just return it using the sendData function and then end the response
    if (question.startsWith('REPLAY:') || localPersonality === 'Passthrough' || question.startsWith(`!image`)) {
      if (question.startsWith(`!image`)) {
        question.replace(`!image:`, 'REPLAY: ').replace(`!image `, 'REPLAY: ');
        console.log(`ChatAPI: Image Question: ${question}`);
      }
      if (debug) {
        console.log(`ChatAPI Replay: ${question.replace('REPLAY:', '').replace('!image:', '').replace('!image', '')}`);
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      sendData(JSON.stringify({ data: '' }));
      sendData(JSON.stringify({ data: question.replace('REPLAY:', '').replace('!image:', '').replace('!image', '') }));
      sendData('[DONE]');
      res.end();
      return;
    }

    // Tokens count is the number of tokens to generate
    let requestedTokens = tokensCount;
    let documentsReturned = documentCount;

    // Set the default history
    let maxCount: number = 16000; // max tokens for GPT-3-16k
    if (modelName === 'gpt-3.5-turbo') {
      maxCount = 4000;
    } else if (modelName === 'gpt-4') {
      maxCount = 8000;
    } else if (modelName === 'gpt-3.5-turbo-16k') {
      maxCount = 16000;
    } else if (modelName === 'gpt-4-32k') {
      maxCount = 32000;
    } else {
      maxCount = 4000;
    }

    if (requestedTokens > maxCount) {
      console.info(`ChatAPI: Requested tokens ${requestedTokens} exceeds max tokens ${maxCount}, limiting to ${maxCount} tokens.`);
      requestedTokens = maxCount;
    }

    // Find a valid namespace
    let namespaces = [selectedNamespace.toLowerCase(), PINECONE_NAME_SPACE, ...OTHER_PINECONE_NAMESPACES.split(',')];
    if (selectedNamespace && selectedNamespace !== 'none') {
      namespaces = [selectedNamespace]; // If a namespace is provided, override the default namespaces
    } else {
      namespaces = []
    }
    const namespaceResult = await getValidNamespace(namespaces);

    if (!namespaceResult) {
      console.error('Pinecone chat: No valid namespace found.');
      res.status(404).end();
      return
    }

    const promptString = (customPrompt == '') ? buildPrompt(localPersonality, isStory) : customPrompt;
    const condensePromptString = (condensePrompt == '') ? buildCondensePrompt(localPersonality, isStory) : condensePrompt;

    let chatHistory = history;
    chatHistory = [{ "type": "systemMessage", "message": promptString }, ...chatHistory, { "type": "userMessage", "message": question }];

    if (debug) {
      console.log('ChatAPI: Pinecone using namespace:', namespaceResult.validNamespace);
      console.log(`ChatAPI: ${isStory ? "Episode" : "Question"} - ${question}`);
      console.log('ChatAPI: Requested tokens:', requestedTokens);
      console.log('ChatAPI: Documents returned:', documentsReturned);
      console.log('ChatAPI: Episode count:', episodeCount);
      console.log('ChatAPI: History:', JSON.stringify(history, null, 2));
      console.log('ChatAPI: Local Personality:', localPersonality);
      console.log('ChatAPI: Custom Prompt:', customPrompt);
      console.log('ChatAPI: Condense Prompt:', condensePrompt);
      console.log('ChatAPI: Command Prompt:', commandPrompt);
      console.log('ChatAPI: Is Story:', isStory ? 'Yes' : 'No');
      console.log('ChatAPI: promptString: ', promptString, ' tokens: ', countTokens(promptString));
      console.log('ChatAPI: condensePromptString: ', condensePromptString, ' tokens: ', countTokens(condensePromptString));
    } else {
      console.log(`ChatAPI: ${modelName}/${fastModelName} ${maxCount}k ${isStory ? "Episode" : "Question"} [${question.slice(0, 20)}...] ${localPersonality} ${isStory ? 'Story' : 'Answer'} ${requestedTokens} tokens ${documentsReturned} documents ${episodeCount} ${isStory ? "episodes" : "answers"}.`);
    }

    // Set headers before starting the chain
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    sendData(JSON.stringify({ data: '' }));

    // Function to create a single chain
    async function createChain(i: number, title: string, namespaceResult: any, localPersonality: any, requestedTokens: number, documentCount: number, userId: string, isStory: boolean, defaultGender: any, speakerLanguage: string, subtitleLanguage: string) {
      let token_count = 0;
      let sceneText = '';
      let sentenceCount: number = 0;
      let sceneCount: number = 0;
      let speaker: string = localPersonality;
      let imageUrl: string = '';
      let gender: string = defaultGender;
      let language: string = speakerLanguage;

      let speakerMap = {
        currentSpeaker: 'groovy', // Default speaker
        lastSpeaker: '',
        isContinuingToSpeak: false,
        isSceneChange: false,
        genderMarkedNames: genderMarkedNames, // Assuming this is defined elsewhere
        defaultModel: model,
        gender: gender,
        voiceModels: voiceModels, // Assuming this is defined elsewhere
        audioLanguage: language,
      };

      // Define a lock variable outside of the callback
      let lock: Promise<void> = Promise.resolve();

      console.log(`createChain: ${isStory ? "Episode" : "Answer"} #${i + 1} of ${localEpisodeCount} ${isStory ? "episodes" : "answers"}. ${isStory ? "Plotline" : "Question"}: "${title}"`);
      let chainResult = await makeChain(
        namespaceResult.vectorStore,
        localPersonality,
        requestedTokens,
        documentCount,
        userId,
        isStory,
        customPrompt,
        condensePrompt,
        commandPrompt,
        modelName,
        fastModelName,
        async (token: string) => {
          // Await the current lock
          await lock;

          // Create a new lock
          let resolveLock: () => void;
          lock = new Promise<void>((resolve) => {
            resolveLock = resolve;
          });

          token_count++;

          sceneText = sceneText + token;

          // check for newlines \n and send the sentence
          if ((sceneText.length > 20 && sceneText.endsWith('\n')) || (sceneText.includes('[SCENE') && sceneText.includes(']')) || sceneText.includes('[END_OF_STREAM]')) {
            // split up scene into sentences
            let sentences_by_character: string[] = nlp(sceneText).sentences().out('array');

            if (sentences_by_character.length === 0) {
              console.error(`createChain: No sentences found in sceneText ${sceneText}, using entire sceneText as a sentence.`);
              sentences_by_character = [sceneText];
            }

            console.log(`chainResult: Found SCENE #${sceneCount} ${sentences_by_character.length} sentences sceneText is ${sceneText.length} characters...\n"${sceneText}"`);

            let scene: Scene = {
              id: sceneCount,
              sentences: [],
              imageUrl: '',
              imagePrompt: '',
            };

            // loop through sentences and create audio/images for each
            for (let i = 0; i < sentences_by_character.length; i++) {
              let sentence_by_character = sentences_by_character[i];
              if (sentence_by_character.length > 0) {
                const cleanSentence: string = removeMarkdownAndSpecialSymbols(sentence_by_character).trim();
                let cleanTranslation: string = '';

                console.log(`chainResult: parsing sentence #${sentenceCount}: ${sentence_by_character.length} characters.\n"${sentence_by_character}"`);

                // translate the sentence to the speaking language
                if (subtitleLanguage != speakerLanguage) {
                  console.log(`chainResult: translateText: ${sentence_by_character} to ${subtitleLanguage}`);
                  try {
                    const translation = await translateText(sentence_by_character, subtitleLanguage);
                    console.log(`chainResult: translation: ${translation}`);
                    cleanTranslation = translation;
                  } catch (error) {
                    console.error(`chainResult: translateText error: ${error}`);
                  }
                }

                let sentence: Sentence = {
                  id: sentenceCount,
                  text: '',
                  speaker: '',
                  model: '',
                  gender: '',
                  language: '',
                  imageUrl: '',
                  audioFile: '',
                };

                // Text sentence
                sentence.text = sentence_by_character;

                // Image
                sentence.imageUrl = imageUrl;

                // gender map the speaker to the character and gender
                buildGenderMap(gender, language, sentence_by_character);

                // analyze the setence for the speaker name and gender and language
                //speakerMap = processSpeakerChange(sentence_by_character, speakerMap);

                // Text to Speech
                sentence.speaker = speaker;
                sentence.gender = gender;
                sentence.language = language;
                sentence.model = '';

                // add audio to scene through generate audio
                try {
                  const newMP3 = await generateTextToSpeechMP3(cleanSentence, episodeId, sentenceCount.toString(), sentence.gender, sentence.language, sentence.model);
                  if (newMP3 != '') {
                    sentence.audioFile = newMP3;
                  } else {
                    console.error(`chainResult: generateTextToSpeechMP3 error: no audio returned for sentence #${sentenceCount} ${sentence_by_character}`);
                  }
                } catch (error) {
                  console.error(`chainResult: generateTextToSpeechMP3 error: ${error}`);
                }
                scene.sentences.push(sentence);
                sentenceCount++;
              }
            }

            // add image to the scene through generate image
            try {
              let newImg = await generateImageAndStory(sceneText, episodeId, sceneCount.toString());
              if (newImg != '') {
                scene.imageUrl = newImg;
                imageUrl = scene.imageUrl;
              } else {
                console.error(`chainResult: generateImageAndStory error: no image returned for scene #${sceneCount} ${sceneText}`);
              }
            } catch (error) {
              console.error(`chainResult: generateImageAndStory error: ${error}`);
            }

            // Assign the image URL to each sentence within the scene
            scene.sentences.forEach(sentence => {
              sentence.imageUrl = imageUrl;
            });

            const jsonData = JSON.stringify({ scene: scene });
            sendData(jsonData);
            //console.log(`chainResult: sending scene #${sceneCount}: ${jsonData.length} characters ${jsonData} ${JSON.stringify(scene, null, 2)}`);

            // clear the scene
            sceneText = '';
            sceneCount++;
          }

          // token counter for status output
          if (token_count % 100 === 0) {
            if (debug) {
              console.log(`ChatAPI: createChain ${isStory ? "Episode" : "Answer"} #${i + 1} Chat Token count: ${token_count}`);
            }
          }

          // send the token to the client
          if (typeof token === 'string') {
            sendData(JSON.stringify({ data: token }));
          } else {
            console.error(`ChatAPI: createChain ${isStory ? "Episode" : "Answer"} #${i + 1} Invalid token:`, token ? token : 'null');
          }
          // Resolve the lock
          resolveLock!();
        });

      if (sceneText != '') {
        // add image to the scene through generate image
        console.error(`ChatAPI: createChain ${isStory ? "Episode" : "Answer"} #${i + 1} Scene text not empty: ${sceneText}`);
      }

      return chainResult;
    }

    // Create an array to hold the chains
    const chains = [];
    const titles: string[] = [];

    let localEpisodeCount: number = episodeCount;
    console.log(`ChatAPI: Episode Count: ${localEpisodeCount}`);
    if (titleArray.length > 0) {
      for (let i = 0; i < titleArray.length; i++) {
        titles.push(titleArray[i]);
        if (localEpisodeCount > 1) {
          for (let j = 1; j < localEpisodeCount; j++) {
            if (isStory) {
              titles.push(`Continue episode next scene...`);
            } else {
              titles.push(`Next answer iteration...`);
            }
          }
        }
      }
    } else {
      titles.push(question);
      if (localEpisodeCount > 1) {
        for (let i = 1; i < localEpisodeCount; i++) {
          if (isStory && localEpisodeCount === (i + 1)) {
            titles.push(`Last episode of ${localEpisodeCount} episodes, the conclusion.`);
          } else if (isStory) {
            titles.push(`Episode ${i + 1} of ${localEpisodeCount} next episode scene...`);
          } else {
            titles.push(`Answer ${i + 1} of ${localEpisodeCount} next answer iteration...`);
          }
        }
      }
    }
    localEpisodeCount = titles.length;

    if (true || debug) {
      console.log(`ChatAPI: Creating ${localEpisodeCount} titles ${JSON.stringify(titles, null, 2)}.`);
    }

    // Create a chain for each episode
    for (let i = 0; i < localEpisodeCount; i++) {
      try {
        console.log(`ChatAPI: Creating Chain for ${isStory ? "Episode" : "Answer"} #${i + 1} of ${localEpisodeCount} ${isStory ? "episodes" : "answers"}.`);
        let title: string = titles[i];
        const chain = await createChain(i, title, namespaceResult, localPersonality, requestedTokens, documentsReturned, userId, isStory, gender, speakingLanguage, subtitleLanguage);

        // Add the title to the chat history
        chatHistory = [...chatHistory, { "type": "userMessage", "message": title }];

        // Add the chain to the array
        chains.push(chain);
        titles.push(title);
      } catch (error: any) {
        console.error(`ChatAPI: Error creating chain ${i + 1} of ${localEpisodeCount} ${isStory ? "episodes" : "answers"}: ${error.message}`);
        sendData(JSON.stringify({ data: 'Error creating chain' }));
        sendData(JSON.stringify({ data: error.message }));
      }
    }

    // Track the total token count
    let total_token_count = 0;

    // Now, run each chain sequentially per episode
    for (let i = 0; i < chains.length; i++) {
      const chain = chains[i];
      let title = titles[i];
      const episodeNumber = i + 1;

      console.info(`=== ChatAPI: Chain #${i} Starting  ${isStory ? "Episode" : "Answer"} #${episodeNumber} of ${localEpisodeCount}  ${isStory ? "episodes" : "answers"}.`);

      let tokenCount = 0;
      let histories: BaseMessage[] = [];
      chatHistory.forEach((hist: { [x: string]: string; }) => {
        if (hist.type === 'userMessage') {
          let req: BaseMessage = new HumanMessage(hist.message);
          histories.push(req);
        } else if (hist.type === 'apiMessage') {
          let respond: BaseMessage = new AIMessage(hist.message);
          histories.push(respond);
        } else if (hist.type === 'systemMessage') {
          let sysmsg: BaseMessage = new AIMessage(hist.message);
          histories.push(sysmsg);
        } else {
          console.error(`ChatAPI: #${i} Invalid history type: ${hist.type} for ${hist.message}\nActually is: ${JSON.stringify(hist, null, 2)}\n}`);
        }
        // count tokens and break after we hit 2k tokens
        tokenCount = tokenCount + countTokens(hist.message);
        if (tokenCount > (maxCount / 4)) {
          return;
        }
      });
      console.log(`ChatAPI: #${i} Converted History of ${tokenCount} tokens.`);

      if (debug) {
        console.log(`History: ${JSON.stringify(histories, null, 2)}`);
      }

      try {
        let response = await chain?.call({
          question: title,
          chat_history: histories,
        });
        if (!response || !response.text || response.text.length === 0 || response.text.startsWith('Error: ')) {
          console.error(`ChatAPI: #${i} GPT API Error, Not enough tokens available to generate a response!!!`);
          sendData(JSON.stringify({ data: 'Out of tokens, please request more.' }));
          if (response && response.text) {
            sendData(JSON.stringify({ data: response.text }));
          }
        }
        total_token_count = total_token_count + countTokens(response.text) + countTokens(title) + countTokens(promptString) + countTokens(condensePromptString);

        if (response.sourceDocuments) {
          // Create a new array with only unique objects
          const uniqueSourceDocuments = response.sourceDocuments.filter((obj: { metadata: { source: any; }; }, index: any, self: { metadata: { source: any; }; }[]) =>
            index === self.findIndex((t: { metadata: { source: any; }; }) => (
              t.metadata && t.metadata.source === obj.metadata.source
            ))
          );

          let references = '';
          for (const reference of uniqueSourceDocuments) {
            if (reference.metadata && reference.metadata.source) {
              references = references + `[Reference: ${path.basename(reference.metadata.source)}]\n`;
            }
          }
          if (sendReferences) {
            sendData(JSON.stringify({ data: `\n\nReferences: ${references}\n` }));
          }
          sendData(JSON.stringify({ sourceDocs: response.sourceDocuments }));
        } else {
          console.error(`ChatAPI: #${i} No reference documents.`);
        }
        console.log(`ChatAPI: #${i} Total Chat Token count: ${total_token_count}`);

        if (debug) {
          console.log(`ChatAPI: #${i} Raw Response: ` + JSON.stringify(response, null, 2) + '\n');
        }
        chatHistory = [...chatHistory, { "type": "apiMessage", "message": response.text }];
      } catch (error: any) {
        if (error.message) {
          console.error(`ChatAPI: #${i} Error generating response for Episode #${episodeNumber}:`, error.message);
          sendData(JSON.stringify({ data: `Error generating response for Episode #${episodeNumber}:\n${error.message}.` }));
        } else {
          console.error(`ChatAPI: #${i} Error generating response for Episode #${episodeNumber}:`, error);
          sendData(JSON.stringify({ data: `Error generating response for Episode #${episodeNumber}:\n${error}.` }));
        }
      }
      sendData(JSON.stringify({ data: "\n\n" }));
    }

    sendData('[DONE]');
    res.end();
  });
}

