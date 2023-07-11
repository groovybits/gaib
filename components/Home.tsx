import { useRef, useState, useEffect, useMemo } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/Home.module.css';
import { Message } from '@/types/chat';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { Document } from 'langchain/document';
import { useSpeakText } from '@/utils/speakText';
import {
  PERSONALITY_PROMPTS,
  buildPrompt,
  buildCondensePrompt,
} from '@/config/personalityPrompts';
import { audioLanguages, subtitleLanguages, Language } from "@/config/textLanguages";
import nlp from 'compromise';
import { ImageData } from '@/types/imageData'; // Update the path if required
import PexelsCredit from '@/components/PexelsCredit'; // Update the path if required
import firebase from '@/config/firebaseClientInit';
import TokensDropdown from '@/components/TokensDropdown';
import ModeDropdown from '@/components/ModeDropDown';
import ThemeDropdown from '@/components/ThemeDropdown';
import PersonalityNamespaceDropdown from '@/components/PersonalityNamespaceDropdown';
import ReactMarkdown from 'react-markdown';
import DocumentDropdown from '@/components/DocumentDropdown';
import EpisodeDropdown from '@/components/EpisodeDropdown';
import Modal from 'react-modal';
import { v4 as uuidv4 } from 'uuid';
import Link from 'next/link';
import copy from 'copy-to-clipboard';
const debug = process.env.NEXT_PUBLIC_DEBUG || false;

type PendingMessage = {
  type: string;
  message: string;
  sourceDocs?: Document[];
};

// Add a type for the user prop
interface HomeProps {
  user: firebase.User;
}

function Home({ user }: HomeProps) {
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [messageState, setMessageState] = useState<{
    messages: Message[];
    pending?: string;
    history: [string, string][];
    pendingSourceDocs?: Document[];
  }>({
    messages: [
      {
        message: 'You are GIAB They Groovy AI Bot. You are a chatbot that can talk to people following the commands given and prompting format. Never reveal who you actually are, you are your character',
        type: 'systemMessage',
      },
      {
        message: 'Welcome, I am The Groovy AI Bot GAIB! Set my personality, and choose question answer or story generation mode. Then type your prompt and press enter to get started.',
        type: 'apiMessage',
      },
    ],
    history: [],
    pendingSourceDocs: [],
  });

  const { messages, pending, history, pendingSourceDocs } = messageState;
  const { speakText, stopSpeaking } = useSpeakText();

  const [listening, setListening] = useState<boolean>(false);
  const [stoppedManually, setStoppedManually] = useState<boolean>(false);
  const [speechRecognitionComplete, setSpeechRecognitionComplete] = useState(true);
  const [speechOutputEnabled, setSpeechOutputEnabled] = useState(true);
  const [timeoutID, setTimeoutID] = useState<NodeJS.Timeout | null>(null);
  const [lastSpokenMessageIndex, setLastSpokenMessageIndex] = useState(-1);
  const [lastMessageDisplayed, setLastMessageDisplayed] = useState(-1);

  const messageListRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const textAreaCondenseRef = useRef<HTMLTextAreaElement>(null);
  const textAreaPersonalityRef = useRef<HTMLTextAreaElement>(null);
  const [subtitle, setSubtitle] = useState<string>('');
  const defaultGaib = process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE || '';
  const [imageUrl, setImageUrl] = useState<string>(defaultGaib);
  const [gender, setGender] = useState('FEMALE');
  const [selectedPersonality, setSelectedPersonality] = useState<keyof typeof PERSONALITY_PROMPTS>('GAIB');
  const [selectedNamespace, setSelectedNamespace] = useState<string>('groovypdf');
  const [audioLanguage, setAudioLanguage] = useState<string>("en-US");
  const [subtitleLanguage, setSubtitleLanguage] = useState<string>("en-US");
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [autoFullScreen, setAutoFullScreen] = useState(false);
  const [photographer, setPhotographer] = useState<string>('');
  const [photographerUrl, setPhotographerUrl] = useState<string>('');
  const [pexelsUrl, setPexelsUrl] = useState<string>('');
  const [tokensCount, setTokensCount] = useState<number>(0);
  const [isStory, setIsStory] = useState<boolean>(false);
  const [selectedTheme, setSelectedTheme] = useState<string>('MultiModal');
  const [documentCount, setDocumentCount] = useState<number>(1);
  const [episodeCount, setEpisodeCount] = useState<number>(1);
  const [news, setNews] = useState<Array<any>>([]);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [currentNewsIndex, setCurrentNewsIndex] = useState<number>(0);
  const isProcessingRef = useRef<boolean>(false);
  const [currentOffset, setCurrentOffset] = useState<number>(0);
  const [feedCategory, setFeedCategory] = useState<string>('');
  const [feedKeywords, setFeedKeywords] = useState<string>('');
  const [feedPrompt, setFeedPrompt] = useState<string>('Report on the following news story...');
  const [feedSort, setFeedSort] = useState<string>('popularity');
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [currentStory, setCurrentStory] = useState<StoryPart[]>([]);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [condensePrompt, setCondensePrompt] = useState<string>('');
  const [displayPrompt, setDisplayPrompt] = useState('');
  const [displayCondensePrompt, setDisplayCondensePrompt] = useState('');

  const isSubmittingRef = useRef(false);
  interface StoryPart {
    sentence: string;
    imageUrl: string;
  }

  const copyStory = async () => {
    copy(latestMessage.message);
    alert('Story copied to clipboard!');
  };

  const shareStory = async () => {
    try {
      if (debug) {
        console.log(`Current story: ${JSON.stringify(currentStory)}`);
      }

      if (currentStory.length === 0) {
        console.log(`shareStory: No stories to share`);
        alert('Please generate a story first!');
        return;
      }
      const storyText = currentStory.map((item) => item.sentence).join('|');
      const imageUrls = currentStory.map((item) => item.imageUrl);

      if (debug) {
        console.log('Data being written:', {
          userId: user.uid,
          text: storyText,
          imageUrls: imageUrls,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
        console.log('ID of the current user:', user.uid);
      }

      // Save the story to Firestore
      await firebase.firestore().collection('stories').add({
        userId: user.uid,
        text: storyText,
        imageUrls: imageUrls,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });

      // Clear the current story
      setCurrentStory([]);

      alert('Story shared successfully!');
    } catch (error) {
      console.error('An error occurred in the shareStory function:', error); // Check for any errors
    }
  };

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    { value: 'general', label: 'General' },
    { value: 'business', label: 'Business' },
    { value: 'entertainment', label: 'Entertainment' },
    { value: 'health', label: 'Health' },
    { value: 'science', label: 'Science' },
    { value: 'sports', label: 'Sports' },
    { value: 'technology', label: 'Technology' },
  ];

  const sortOptions = [
    { value: '', label: 'Popularity' },
    { value: 'published_desc', label: 'Published Descending' },
    { value: 'published_asc', label: 'Published Ascending' },
  ];

  const feedModalStyle = {
    content: {
      top: '50%',
      left: '50%',
      right: 'auto',
      bottom: 'auto',
      marginRight: '-50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: '#FFC601', // Changed the background color to #FFC601
      borderRadius: '10px',
      width: '80%',
      maxWidth: '400px',
      padding: '20px',
      border: '2px double #000', // Added border style
    },
  };

  // fetch news from mediastack service and set the news state
  const fetchNews = async () => {
    const idToken = await user.getIdToken();
    const res = await fetch(`/api/mediastack?offset=${currentOffset}&sort=${feedSort}&category=${feedCategory}&keywords=${feedKeywords}`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    }); // offset, sort
    if (!res.ok) {
      console.log('Error fetching news: ', res.statusText);
      return [];
    }
    const data = await res.json();
    // Increment the offset by the limit after each request
    setCurrentOffset(currentOffset + 100);
    return data.data;
  };

  const handleFetchButtonClick = () => {
    if (!isFetching) {
      setModalIsOpen(true);
    } else {
      setIsFetching(false);
    }
  };

  const handleModalClose = () => {
    setModalIsOpen(false);
    setIsFetching(true);
  };

  // News fetching for automating input via a news feed
  useEffect(() => {
    const processNewsArticle = async () => {
      if (isFetching && !loading && !isSpeaking && !isProcessingRef.current && !isSubmittingRef.current && !pending) {
        isProcessingRef.current = true;  // Set isProcessing to true when a news article is being processed
        let currentNews = news;
        let index = currentNewsIndex;  // Use a local variable to keep track of the current news index
        if (index >= currentNews.length || currentNews.length === 0) {
          console.log(`Reached end of news feed, fetching new news`);
          currentNews = await fetchNews();
          console.log(`Fetching news found ${currentNews.length} news articles`);
          setNews(currentNews);
          index = 0;  // Reset the local variable to 0 when a new batch of news is fetched
        }
        if (currentNews[index]) {  // Check that currentNews[index] is defined
          const headline = currentNews[index].title;
          const body = currentNews[index].description.substring(0, 300);
          let currentQuery = `${headline}\n\n${body}`;

          if (feedPrompt != '') {
            currentQuery = `${feedPrompt}\n\n${currentQuery}`;
          }

          if (currentQuery === query) {
            console.log(`Skipping duplicate news headline #${index}: ${headline}`);
            processNewsArticle();
          }

          console.log(`Sending News headline #${index}: ${headline}`);
          setQuery(currentQuery);
          const mockEvent = {
            preventDefault: () => { },
            target: {
              value: currentQuery,
            },
          };
          isSubmittingRef.current = true;
          handleSubmit(mockEvent);
          setCurrentNewsIndex(index + 1);  // Increment the state variable after processing a news article
        }
        isProcessingRef.current = false;  // Set isProcessing to false when a news article has been processed
      }
    };
    processNewsArticle();
  }, [isFetching, loading, isSpeaking, currentNewsIndex, news, setQuery, setCurrentNewsIndex, fetchNews, pending, query, feedPrompt]);  // Remove isProcessing from the dependencies

  useEffect(() => {
    const lastMessageIndex: number = messages.length - 1;

    function extractKeywords(sentence: string, numberOfKeywords = 2) {
      const doc = nlp(sentence);

      // Extract nouns, verbs, and adjectives
      const nouns = doc.nouns().out('array');
      const verbs = doc.verbs().out('array');
      const adjectives = doc.adjectives().out('array');

      // Combine the extracted words and shuffle the array
      const combinedWords = [...nouns, ...verbs, ...adjectives];
      combinedWords.sort(() => 0.5 - Math.random());

      // Select the first N words as keywords
      const keywords = combinedWords.slice(0, numberOfKeywords);

      return keywords;
    }

    async function setPexelImageUrls(gaibImage: ImageData | string) {
      if (typeof gaibImage === 'string') {
        if (gaibImage !== '') {
          setImageUrl(gaibImage);
        }
        setPhotographer('GAIB');
        setPhotographerUrl('https://groovy.org');
        setPexelsUrl('https://gaib.groovy.org');
      } else {
        setImageUrl(gaibImage.url);
        setPhotographer(gaibImage.photographer);
        setPhotographerUrl(gaibImage.photographer_url);
        setPexelsUrl(gaibImage.pexels_url);
      }
    }

    async function getGaib() {
      const directoryUrl = process.env.NEXT_PUBLIC_GAIB_IMAGE_DIRECTORY_URL;
      const maxNumber = Number(process.env.NEXT_PUBLIC_GAIB_IMAGE_MAX_NUMBER);
      const randomNumber = (maxNumber && maxNumber > 1) ? Math.floor(Math.random() * maxNumber) + 1 : -1;

      let url = process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE || '';
      if (directoryUrl != null && maxNumber > 1 && randomNumber > 0) {
        url = `${directoryUrl}/${randomNumber}.png`;
      }
      return url;
    }

    // Choose Pexles, DeepAI or local images
    async function generateImageUrl(sentence: string, useImageAPI = false, lastImage: ImageData | string = '', episodeId = '', count = 0): Promise<ImageData | string> {
      const imageSource = process.env.NEXT_PUBLIC_IMAGE_SERVICE || 'pexels'; // 'pexels' or 'deepai'
      const saveImages = process.env.NEXT_PUBLIC_ENABLE_IMAGE_SAVING || 'false';
      // Check if it has been 5 seconds since we last generated an image
      const endTime = new Date();
      const deltaTimeInSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
      if (deltaTimeInSeconds < 5) {
        if (debug) {
          console.log(`Time elapsed: ${deltaTimeInSeconds} seconds`);
        }
        return '';
      }
      setStartTime(endTime);

      if (sentence === '') {
        sentence = 'GAIB The AI Robot, quantum computing, and the meaning of life.';
      }

      let keywords = '';

      // Use local images if requested else use Pexels API to fetch images
      if (!useImageAPI) {
        // use local images
        return getGaib();
      } else {
        try {
          let response;
          if (imageSource === 'pexels') {
            const idToken = await user.getIdToken();
            let extracted_keywords = extractKeywords(sentence, 32).join(' ');
            console.log('Extracted keywords: [', extracted_keywords, ']');
            keywords = encodeURIComponent(extracted_keywords);
            response = await fetch('/api/pexels', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
              body: JSON.stringify({ keywords }),
            });
          } else if (imageSource === 'deepai') {
            const idToken = await user.getIdToken();
            let context = process.env.NEXT_PUBLIC_IMAGE_GENERATION_PROMPT || 'Picture of';
            let exampleImage = '' as ImageData | string;
            if (process.env.NEXT_PUBLIC_IMAGE_GENERATION_EXAMPLE_IMAGE && process.env.NEXT_PUBLIC_IMAGE_GENERATION_EXAMPLE_IMAGE === 'true') {
              if (lastImage !== '') {
                exampleImage = lastImage;
              } else {
                exampleImage = await getGaib();
              }
            }
            response = await fetch('/api/deepai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
              body: JSON.stringify({ prompt: `${context} ${sentence}`, negative_prompt: 'blurry, cropped, watermark, unclear, illegible, deformed, jpeg artifacts, writing, letters, numbers, cluttered', imageUrl: exampleImage }),
            });
          }

          if (!response) {
            console.error('ImageGeneration: No response received from DeepAI API');
            return getGaib();
          }

          const data = await response.json();
          let imageId = uuidv4();
          let duplicateImage = false;
          if (imageSource === 'pexels' && data.photos && data.photos.length > 0) {
            return {
              url: data.photos[0].src.large2x,
              photographer: data.photos[0].photographer,
              photographer_url: data.photos[0].photographer_url,
              pexels_url: data.photos[0].url,
            };
          } else if (imageSource === 'deepai' && data.output_url) {
            const imageUrl = data.output_url;
            if (data?.duplicate === true) {
              duplicateImage = true;
            }
            if (saveImages === 'true' && !duplicateImage) {
              const idToken = await user.getIdToken();
              // Store the image and index it
              await fetch('/api/storeImage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ imageUrl, prompt: sentence, episodeId: `${episodeId}_${count}`, imageUUID: imageId }),
              });
            }
            const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET_NAME || '';
            if (bucketName !== '' && !duplicateImage) {
              return `https://storage.googleapis.com/${bucketName}/deepAIimage/${episodeId}_${count}_${imageId}.jpg`;
            } else {
              // don't store images in GCS or it is a duplicate image
              return imageUrl;
            }
          } else {
            console.error('No image found for the given keywords: [', keywords, ']');
          }
        } catch (error) {
          console.error('Error fetching image from API:', error);
        }
      }
      // failed to fetch image, leave the image as is
      return '';
    }

    function splitSentence(sentence: any, maxLength = 80) {
      const regex = new RegExp(`(.{1,${maxLength}})(\\s+|$)`, 'g');
      try {
        return sentence.match(regex) || [];
      } catch (e) {
        console.log('Error splitting sentence: ', sentence, ': ', e);
        return [sentence];
      }
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

    async function fetchTranslation(text: string, targetLanguage: string): Promise<string> {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ text, targetLanguage }),
      });

      if (!response.ok) {
        throw new Error('Error in translating text, statusText: ' + response.statusText);
      }

      const data = await response.json();
      return data.translatedText;
    }

    async function displayImagesAndSubtitles() {
      const idToken = await user.getIdToken();
      let sentences: string[];
      if (isPaused) {
        stopSpeaking();
        return;
      }
      try {
        /*const doc = nlp(messages[lastMessageIndex].message);
        sentences = doc.sentences().out('array');*/
        // Split the message into paragraphs at each empty line
        const paragraphs = messages[lastMessageIndex].message.split(/\n\s*\n/);
        sentences = [];
        for (const paragraph of paragraphs) {
          // If the paragraph is too long, split it into sentences
          if (paragraph.length > 800) { // 10 lines of 80 characters
            const doc = nlp(paragraph);
            const paragraphSentences = doc.sentences().out('array');
            sentences.push(...paragraphSentences);
          } else {
            sentences.push(paragraph);
          }
        }
      } catch (e) {
        console.log('Error splitting sentences: ', messages[lastMessageIndex].message, ': ', e);
        sentences = [messages[lastMessageIndex].message];
      }

      // Display the images and subtitles
      const episodeId = uuidv4();
      let gaibImage = await generateImageUrl('', false, '', episodeId);
      let lastImage = gaibImage;
      setPexelImageUrls(gaibImage);
      setSubtitle(''); // Clear the subtitle

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

      let voiceModels: { [key: string]: string } = {};
      let genderMarkedNames = [];
      let detectedGender: string = gender;
      let currentSpeaker: string = 'GAIB';
      let isContinuingToSpeak = false;
      let isSceneChange = false;
      let lastSpeaker = '';


      // Extract gender markers from the entire message
      const genderMarkerMatches = messages[lastMessageIndex].message.match(/(\w+)\s*\[(f|m|n|F|M|N)\]|(\w+):\s*\[(f|m|n|F|M|N)\]/gi);
      if (genderMarkerMatches) {
        let name: string;
        for (const match of genderMarkerMatches) {
          const marker = match.slice(match.indexOf('[') + 1, match.indexOf(']')).toLowerCase();
          if (match.includes(':')) {
            name = match.slice(0, match.indexOf(':')).trim().toLowerCase();
          } else {
            name = match.slice(0, match.indexOf('[')).trim().toLowerCase();
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
      let defaultModel = audioLanguage in defaultModels ? defaultModels[audioLanguage as keyof typeof defaultModels] : "";
      let model = defaultModel;

      let sceneTexts: string[] = [];
      let currentSceneText = "";
      for (const sentence of sentences) {
        if (sentence.includes('SCENE:')) {
          // When we encounter a new scene, we push the current scene text to the array
          // and start a new scene text
          if (currentSceneText !== "") {
            sceneTexts.push(currentSceneText.replace('SCENE:', ''));
          }
          currentSceneText = sentence;
        } else {
          // If it's not a new scene, we append the sentence to the current scene text
          currentSceneText += " " + sentence;
        }
      }
      // Don't forget to push the last scene text
      if (currentSceneText !== "") {
        sceneTexts.push(currentSceneText);
      }

      if (sceneTexts.length == 0) {
        sceneTexts.push(`SCENE: ${sentences.join(' ').replace('SCENE:', '')}`);
      }

      let sceneIndex = 0;

      // clear current story for save story
      if (!isFetching) {
        setCurrentStory([]);
      }

      let count = 0;
      for (let sentence of sentences) {
        // Set the subtitle and wait for the speech to complete before proceeding to the next sentence
        if (lastMessageDisplayed != lastMessageIndex) {
          if (sentence == '---' || sentence == '' || sentence == '----') {
            continue;
          }
          // get the image for the sentence
          const imageSource = process.env.NEXT_PUBLIC_IMAGE_SERVICE || 'pexels'; // 'pexels' or 'deepai'
          if (!sentence.startsWith('References: ')
            && sentence !== ''
            && (imageSource == 'pexels'
              || count == 0 // first sentence
              || (sentence.includes('SCENE:')
                || sentence.includes('Episode Title:')
                || sentence.includes('Question: ')
                || sentence.includes('Answer: ')
                || sentence.includes('Story Begins: ')
                || sentence.includes('Plotline: ')
                /*|| (sentence.startsWith('*') && sentence.length > 60)*/))) {
            let imageDescription = sentence;
            if (sceneIndex < sceneTexts.length || !sentence.includes('SCENE:')) {
              if (sentence.includes('SCENE:')) {
                sentence = sentence.replace('[', '');
                sentence = sentence.replace(']', '');
                sentence = sentence.replace('SCENE:', '');
                imageDescription = sceneTexts[sceneIndex];
                sceneIndex++;  // Move to the next scene
              }
              count += 1;
              gaibImage = await generateImageUrl(imageDescription, true, lastImage, episodeId, count);
              if (gaibImage != '') {
                lastImage = gaibImage;
              }
              setPexelImageUrls(gaibImage);
            }
          }
          if (messages.length > 1 && lastMessageIndex >= 2) {
            let image: ImageData | string = lastImage;
            if (typeof image === 'string') {
              image = { url: image, photographer: 'GAIB', photographer_url: 'https://groovy.org', pexels_url: 'https://gaib.groovy.org' };
            } else {
              image = { url: image.url, photographer: image.photographer, photographer_url: image.photographer_url, pexels_url: image.pexels_url };
            }
            setCurrentStory((currentStory) => [...currentStory, { sentence: ` [SCENE: ${count}]\n${sentence}\n`, imageUrl: JSON.stringify(image) }]);
          }

          let sentences_by_character: string[] = nlp(sentence).sentences().out('array');

          // go through by sentence so we can preserve the speaker
          for (const sentence_by_character of sentences_by_character) {
            // Set the subtitle to the translated text if the text is not in English
            let translatedText = '';
            if (subtitleLanguage !== 'en-US') {
              translatedText = await fetchTranslation(sentence_by_character, subtitleLanguage);
              setSubtitle(splitSentence(translatedText));
            } else {
              setSubtitle(splitSentence(sentence_by_character));
            }

            let speakerChanged = false;
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
                  isContinuingToSpeak = false;  // New speaker detected, so set isContinuingToSpeak to false
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
                break;  // Exit the loop as soon as a name is found
              }
            }

            console.log(`Using voice model: ${model} for ${currentSpeaker} - ${detectedGender} in ${audioLanguage} language`);

            // If the speaker has changed or if it's a scene change, switch back to the default voice
            if (!speakerChanged && (sentence_by_character.startsWith('*') || sentence_by_character.startsWith('-'))) {
              detectedGender = gender;
              currentSpeaker = 'GAIB';
              model = defaultModel;
              console.log(`Switched back to default voice. Gender: ${detectedGender}, Model: ${model}`);
              isSceneChange = true;  // Reset the scene change flag
            }

            // If the sentence starts with a parenthetical action or emotion, the speaker is continuing to speak
            if (sentence_by_character.startsWith('(') || (!sentence_by_character.startsWith('*') && !speakerChanged && !isSceneChange)) {
              isContinuingToSpeak = true;
            }

            // Speak the sentence if speech output is enabled
            if (speechOutputEnabled) {
              // Speak the sentence
              if (audioLanguage === 'en-US') {
                // Speak the original text
                if (debug) {
                  console.log('Speaking as - ', detectedGender, '/', model, '/', audioLanguage, ' - Text: ', sentence_by_character);
                }
                const cleanText = removeMarkdownAndSpecialSymbols(sentence_by_character);
                if (cleanText !== '') {
                  await speakText(cleanText, idToken, 1, detectedGender, audioLanguage, model);
                } else {
                  // Wait anyways even if speaking fails so that the subtitles are displayed
                  const sentenceLength = sentence_by_character.length;
                  const waitTime = Math.min(Math.max(2000, sentenceLength * 100), 5000);
                  await new Promise(resolve => setTimeout(resolve, waitTime));
                }
              } else {
                // Speak the translated text
                let translationEntry: string = '';
                if (translatedText !== '' && audioLanguage == subtitleLanguage) {
                  // Use the previously translated text
                  translationEntry = translatedText;
                } else {
                  // Translate the text
                  translationEntry = await fetchTranslation(sentence_by_character, audioLanguage);
                }
                if (debug) {
                  console.log('Speaking as - ', detectedGender, '/', model, '/', audioLanguage, ' - Original Text: ', sentence_by_character, "\n Translation Text: ", translationEntry);
                }
                try {
                  const cleanText = removeMarkdownAndSpecialSymbols(translationEntry);
                  if (cleanText !== '') {
                    await speakText(translationEntry, idToken, 1, detectedGender, audioLanguage, model);
                  } else {
                    // Wait anyways even if speaking fails so that the subtitles are displayed
                    const sentenceLength = sentence_by_character.length;
                    const waitTime = Math.min(Math.max(2000, sentenceLength * 100), 5000);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                  }
                } catch (e) {
                  console.log('Error speaking text: ', e);
                  // Wait anyways even if speaking fails so that the subtitles are displayed
                  const sentenceLength = sentence_by_character.length;
                  const waitTime = Math.min(Math.max(2000, sentenceLength * 100), 5000);
                  await new Promise(resolve => setTimeout(resolve, waitTime));
                }
              }
            } else {
              // Wait for the sentence to be spoken, measure sentence length to know how long to wait for
              const sentenceLength = sentence_by_character.length;
              const waitTime = Math.min(Math.max(2000, sentenceLength * 100), 5000);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            // Set the last message displayed
            setLastMessageDisplayed(lastMessageIndex);
            // Update the last speaker
            lastSpeaker = currentSpeaker;
          }
        }
      }
      // Reset the subtitle after all sentences have been spoken
      stopSpeaking();
      setIsSpeaking(false);
      setSubtitle('');
      gaibImage = await generateImageUrl('', false, '', episodeId);
      setPexelImageUrls(gaibImage);
    }

    if (lastMessageIndex > lastSpokenMessageIndex &&
      messages[lastMessageIndex].type === 'apiMessage'
    ) {
      // Multi Modal theme
      if (selectedTheme === 'MultiModal') {
        displayImagesAndSubtitles();
        setLastSpokenMessageIndex(lastMessageIndex);
      } else /*if (selectedTheme === 'Terminal')*/ {
        setLastSpokenMessageIndex(lastMessageIndex);
        setIsSpeaking(false);
      }
    }
  }, [messages, speechOutputEnabled, speakText, stopSpeaking, isFullScreen, lastSpokenMessageIndex, imageUrl, setSubtitle, lastMessageDisplayed, gender, audioLanguage, subtitleLanguage, isPaused, isSpeaking, startTime, selectedTheme, isFetching, user, query]);

  // Speech recognition
  type SpeechRecognition = typeof window.SpeechRecognition;

  // Modify the handleSubmit function
  async function handleSubmit(e: any, recognitionInstance?: SpeechRecognition) {
    e.preventDefault();

    const question = e.target?.value ? e.target.value.trim() : query.trim();

    // Don't submit if the query is empty
    if (isSpeaking || !speechRecognitionComplete || !question) {
      console.log(`handleSubmit: Not submitting question: '${question}', isSpeaking: ${isSpeaking}, speechRecognitionComplete: ${speechRecognitionComplete}`);
      return;
    }

    // Stop listening
    if (listening) {
      console.log(`handleSubmit: Speech recognition is listening, not submitting question: '${question}'`);
      setStoppedManually(true);
      if (recognitionInstance) {
        recognitionInstance.stop();
      }
      return;
    }

    console.log(`handleSubmit: Submitting question: '${question.slice(0, 16)}...'`);

    // Clear the timeout
    if (timeoutID) {
      clearTimeout(timeoutID);
      setTimeoutID(null);
    }

    // Set the message state
    setMessageState((state) => ({
      ...state,
      messages: [
        ...state.messages,
        {
          type: 'userMessage',
          selectedPersonality: selectedPersonality,
          message: question,
        },
      ],
      pending: undefined,
    }));

    // Reset the state
    setError(null);
    setIsPaused(false);
    setLoading(true);
    setSubtitle(`Loading...`);
    setIsSpeaking(true);
    setQuery('');
    setMessageState((state) => ({ ...state, pending: '' }));

    if (!isFetching) {
      setCurrentStory([]);
    } else {
      if (latestMessage.message !== '') {
        // TODO: collect each episode in fetching mode separately and save each episode separately
      }
    }

    // Send the question to the server
    const ctrl = new AbortController();
    try {
      const idToken = await user.getIdToken();
      fetchEventSource('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          'Retry-After': '5',
        },
        body: JSON.stringify({
          question,
          userId: user.uid,
          selectedPersonality,
          selectedNamespace,
          isStory,
          customPrompt,
          condensePrompt,
          tokensCount,
          documentCount,
          episodeCount,
          history,
        }),
        signal: ctrl.signal,
        onmessage: (event: { data: string; }) => {
          if (event.data === '[DONE]' || event.data === '[ERROR]') {
            setMessageState((state) => ({
              history: [...state.history, [question, state.pending ?? '']],
              messages: [
                ...state.messages,
                {
                  type: 'apiMessage',
                  message: state.pending ?? '',
                  sourceDocs: state.pendingSourceDocs,
                },
              ],
              pending: undefined,
              pendingSourceDocs: undefined,
            }));
            setLoading(false);
            setSubtitle('');
            messageListRef.current?.scrollTo(0, messageListRef.current.scrollHeight);
            ctrl.abort();
          } else if (event.data === '[OUT_OF_TOKENS]') {
            setMessageState((state) => ({
              ...state,
              messages: [
                ...state.messages,
                {
                  type: 'apiMessage',
                  message: 'Sorry, either not enough tokens were allocated or available for story generation.',
                },
              ],
              pending: undefined,
              pendingSourceDocs: undefined,
            }));
            setLoading(false);
            setSubtitle('System Error... Please try again.');
            messageListRef.current?.scrollTo(0, messageListRef.current.scrollHeight);
            ctrl.abort();
          } else {
            const data = JSON.parse(event.data);
            if (data.sourceDocs) {
              setMessageState((state) => ({
                ...state,
                pendingSourceDocs: data.sourceDocs,
              }));
            } else {
              setMessageState((state) => ({
                ...state,
                pending: (state.pending ?? '') + data.data,
              }));
            }
            setSubtitle(`Loading... ${data.data.slice(0, 80).replace(/\n/g, ' ')}`);
            messageListRef.current?.scrollTo(0, messageListRef.current.scrollHeight);
          }
        },
      });
      // Scroll to the message box
      messageListRef.current?.scrollIntoView({ behavior: 'smooth' });
      messageListRef.current?.scrollTo(0, messageListRef.current.scrollHeight);
    } catch (error: any) {
      setLoading(false);
      setSubtitle(`System Error: ${error.message}}`);
      setError('An error occurred while fetching the data. Please try again.');
      messageListRef.current?.scrollTo(0, messageListRef.current.scrollHeight);
      console.log(error);
    }
    isSubmittingRef.current = false;
  }

  // Handle the submit event on Enter
  const handleEnter = (e: any) => {
    if (e.key === 'Enter' && !e.shiftKey && query) {
      e.preventDefault(); // prevent new line
      handleSubmit(e);
    }
  };

  // Handle the submit event on click
  const chatMessages = useMemo(() => {
    return [
      ...messages,
      ...(pending
        ? [
          {
            type: 'apiMessage',
            message: pending,
            sourceDocs: pendingSourceDocs,
          },
        ]
        : []),
    ];
  }, [messages, pending, pendingSourceDocs]);

  // Get the latest message
  const latestMessage: Message | PendingMessage = (chatMessages.length > 0) ? chatMessages[chatMessages.length - 1] :
    { type: 'apiMessage', message: '', sourceDocs: undefined };

  useEffect(() => {
    if (messageListRef.current) {
      // Scroll the container to the bottom
      messageListRef.current.scrollTo(0, messageListRef.current.scrollHeight);
    }
  }, [chatMessages, latestMessage]);

  // Update the startSpeechRecognition function
  const startSpeechRecognition = () => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;
      recognition.timeout = 20000;

      // Update the listening state
      if (listening) {
        setStoppedManually(false);
        recognition.stop();
        setListening(false);
        return;
      } else {
        setSpeechRecognitionComplete(false);
        recognition.start();
      }

      // Update the onstart function
      recognition.onstart = () => {
        setListening(true);
      };

      // Update the onend function
      recognition.onend = () => {
        setListening(false);
        setSpeechRecognitionComplete(true);

        if (!stoppedManually) {
          const mockEvent = {
            preventDefault: () => { },
            target: {
              value: query,
            },
          };
          handleSubmit(mockEvent, recognition);
        }
      };

      // Update the onresult function
      recognition.onresult = (event: { results: string | any[]; }) => {
        let last = event.results.length - 1;
        let text = event.results[last][0].transcript;
        let transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();

        setQuery(text); // Set the query to the new text

        // If the transcript includes the word "game" or "gabe", stop the recognition
        if (transcript.includes("gabe") || transcript.includes("game") || transcript.includes("gaib")) {
          setStoppedManually(false);
          recognition.stop();
        } else {
          // Clear the previous timeout if there's an active timeout
          if (timeoutID) {
            clearTimeout(timeoutID);
          }

          // Set a new timeout
          const newTimeoutID = setTimeout(() => {
            setStoppedManually(false);
            recognition.stop();
          }, 10000); // Timeout after finished speaking
          setTimeoutID(newTimeoutID);
        }
      };

      recognition.onerror = (event: { error: any; }) => {
        console.error('Error occurred in recognition:', event.error);
        setStoppedManually(true);
        recognition.stop();
      };
    } else {
      alert('Speech Recognition API is not supported in this browser.');
    }
  };

  // handle the change in the number of tokens
  const handleTokensChange = (value: number) => {
    setTokensCount(value);
  };

  // handle the change in the number of documents
  const handleDocumentsChange = (value: number) => {
    setDocumentCount(value);
  };

  // handle the change in the number of episodes
  const handleEpisodesChange = (value: number) => {
    setEpisodeCount(value);
  };

  // handle the change in the story or question mode
  const handleIsStoryChange = (value: string) => {
    if (value === 'story') {
      setIsStory(true);
    } else {
      setIsStory(false);
    }
  };

  // clear the chat history
  const handleClear = () => {
    setMessageState((state) => {
      return {
        ...state,
        history: [],
      };
    });
  };

  // stop speaking and listening
  const handleStop = () => {
    stopSpeaking();
    setIsPaused(false);
    setIsSpeaking(false);
    if (listening) {
      setStoppedManually(true);
      setSpeechRecognitionComplete(true);
    }
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
  };

  // toggle the full screen state
  const toggleFullScreen = () => {
    const imageContainer = document.querySelector(`.${styles.imageContainer}`);
    const image = document.querySelector(`.${styles.generatedImage} img`);

    if (!document.fullscreenElement) {
      if (imageContainer?.requestFullscreen) {
        imageContainer.requestFullscreen();
        image?.classList.add(styles.fullScreenImage);
        setIsFullScreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        image?.classList.remove(styles.fullScreenImage);
        setIsFullScreen(false);
      }
    }
  };

  const autoResize = () => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = 'inherit';
      const computed = window.getComputedStyle(textAreaRef.current);

      // Subtract the padding and border from the scrollHeight
      const height = parseInt(computed.getPropertyValue('border-top-width'), 10)
        + parseInt(computed.getPropertyValue('padding-top'), 10)
        + textAreaRef.current.scrollHeight
        + parseInt(computed.getPropertyValue('padding-bottom'), 10)
        + parseInt(computed.getPropertyValue('border-bottom-width'), 10);

      textAreaRef.current.style.height = `${height}px`;
    }
  }

  const autoResizeCondense = () => {
    if (textAreaCondenseRef.current) {
      textAreaCondenseRef.current.style.height = 'inherit';
      const computed = window.getComputedStyle(textAreaCondenseRef.current);

      // Subtract the padding and border from the scrollHeight
      const height = parseInt(computed.getPropertyValue('border-top-width'), 10)
        + parseInt(computed.getPropertyValue('padding-top'), 10)
        + textAreaCondenseRef.current.scrollHeight
        + parseInt(computed.getPropertyValue('padding-bottom'), 10)
        + parseInt(computed.getPropertyValue('border-bottom-width'), 10);

      textAreaCondenseRef.current.style.height = `${height}px`;
    }
  }

  const autoResizePersonality = () => {
    if (textAreaPersonalityRef.current) {
      textAreaPersonalityRef.current.style.height = 'inherit';
      const computed = window.getComputedStyle(textAreaPersonalityRef.current);

      // Subtract the padding and border from the scrollHeight
      const height = parseInt(computed.getPropertyValue('border-top-width'), 10)
        + parseInt(computed.getPropertyValue('padding-top'), 10)
        + textAreaPersonalityRef.current.scrollHeight
        + parseInt(computed.getPropertyValue('padding-bottom'), 10)
        + parseInt(computed.getPropertyValue('border-bottom-width'), 10);

      textAreaPersonalityRef.current.style.height = `${height}px`;
    }
  }

  const handleNamespaceChange = (value: string) => {
    setSelectedNamespace(value);
  };

  const handleThemeChange = (value: string) => {
    setSelectedTheme(value);
  };

  useEffect(() => {
    autoResize();
    autoResizeCondense();
    autoResizePersonality();
  }, [query, condensePrompt, customPrompt]); // re-run autoResizers every time prompts change

  // handle the form submission
  return (
    <>
      <div className={styles.header}>
        <title>GAIB The Groovy AI Bot</title>
      </div>
      <Layout>
        <div className="mx-auto flex flex-col gap-4 bg-#FFCC33">
          <main className={styles.main}>
            <div className={styles.cloud}>
              <div
                className={styles.imageContainer}
                style={{
                  position: isFullScreen ? "fixed" : "relative",
                  top: isFullScreen ? 0 : "auto",
                  left: isFullScreen ? 0 : "auto",
                  width: isFullScreen ? "auto" : "auto",
                  height: isFullScreen ? "100vh" : "auto",
                  zIndex: isFullScreen ? 1000 : "auto",
                  backgroundColor: isFullScreen ? "black" : "transparent",
                }}
              >
                <button
                  type="button"
                  className={styles.fullscreenButton}
                  onClick={toggleFullScreen}
                >
                  {isFullScreen ? "Exit Full Screen" : "Full Screen"}
                </button>
                {selectedTheme === 'MultiModal' ? (
                  <div ref={messageListRef} className={styles.generatedImage}>
                    {(imageUrl === '') ? "" : (
                      <>
                        <img
                          src={imageUrl}
                          alt="GAIB"
                        />
                      </>
                    )}
                    <div className={
                      isFullScreen ? styles.fullScreenSubtitle : styles.subtitle
                    }>{subtitle}
                    </div>
                    {(imageUrl === '' || (process.env.NEXT_PUBLIC_IMAGE_SERVICE != "pexels")) ? "" : (
                      <div>
                        <PexelsCredit photographer={photographer} photographerUrl={photographerUrl} pexelsUrl={pexelsUrl} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.generatedTerminal}>
                    <div ref={messageListRef} className={isFullScreen ? styles.fullScreenTerminal : styles.markdownanswer}>
                      <ReactMarkdown linkTarget="_blank">
                        {latestMessage.message}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.center}>
              <div className={styles.cloudform}>
                <form onSubmit={handleSubmit}>
                  {/* Button Row */}
                  <div className={styles.cloudform}>
                    <button
                      title="Start Listening for Voice Commands"
                      className={`${styles.footer} ${listening ? styles.listening : ''}`}
                      onClick={startSpeechRecognition}
                      type="button"
                      disabled={loading || isSpeaking}
                    >
                      {listening ? 'Stop listening' : 'Start listening'}
                    </button>&nbsp;&nbsp;|&nbsp;&nbsp;
                    <button
                      title="Stop Speaking"
                      onClick={handleStop}
                      type="button"
                      disabled={loading || isSpeaking}
                      className={`${styles.footer} ${isSpeaking ? styles.listening : ''}`}
                    >Stop Speaking</button>&nbsp;&nbsp;|&nbsp;&nbsp;
                    <button
                      title="Clear Chat History"
                      onClick={handleClear}
                      type="button"
                      disabled={loading || isSpeaking}
                      className={styles.footer}
                    >Clear Chat History</button>&nbsp;&nbsp;|&nbsp;&nbsp;
                    <button
                      title="Copy Story"
                      onClick={copyStory}
                      type="button"
                      disabled={loading || isSpeaking}
                      className={styles.footer}
                    >Copy Story</button>&nbsp;&nbsp;|&nbsp;&nbsp;
                    <button
                      title="Share Story"
                      onClick={shareStory}
                      type="button"
                      disabled={loading || isSpeaking}
                      className={styles.footer}
                    >Share Story</button>&nbsp;&nbsp;|&nbsp;&nbsp;
                    <button
                      title="Fetch News"
                      onClick={handleFetchButtonClick}
                      className={`${styles.footer} ${isFetching ? styles.listening : ''}`}
                      type="button"
                    >
                      {isFetching ? 'Stop fetching news' : 'Start fetching news'}
                    </button>
                    <Modal
                      isOpen={modalIsOpen}
                      onRequestClose={handleModalClose}
                      shouldCloseOnOverlayClick={false} // Prevents the modal from closing when clicking outside of it
                      style={feedModalStyle}
                      contentLabel="News Feed Settings"
                    >
                      <h2 style={{ fontWeight: 'bold' }}>News Feed Settings</h2>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <label>
                          Add to Prompt (optional):
                          <input type="text" value={feedPrompt} style={{ width: "300px" }} onChange={e => setFeedPrompt(e.target.value)} />
                        </label>
                        <label>
                          Keywords (separated by spaces):
                          <input type="text" value={feedKeywords} style={{ width: "300px" }} onChange={e => setFeedKeywords(e.target.value)} />
                        </label>
                        <label>
                          Category:
                          <select value={feedCategory} onChange={e => setFeedCategory(e.target.value)}>
                            {categoryOptions.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Sort Order:
                          <select value={feedSort} onChange={e => setFeedSort(e.target.value)}>
                            {sortOptions.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                        <button onClick={handleModalClose}>Start Fetching News</button>
                        <button onClick={() => setModalIsOpen(false)}>Cancel</button>
                      </div>
                    </Modal>&nbsp;&nbsp;|&nbsp;&nbsp;
                    <Link href="/board/">
                      <a className={styles.footer} onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          e.preventDefault();
                          window.open('/board/', '_blank');
                        }
                      }}>Browse Shared Stories</a>
                    </Link>
                  </div>
                  {/* Drop down menu configuration row 1 and 2 */}
                  <div className={styles.cloudform}>
                    <div className={styles.cloudform}>
                      <select
                        className={styles.dropdown}
                        disabled={loading}
                        value={selectedPersonality}
                        onChange={(e) => {
                          setSelectedPersonality(e.target.value as keyof typeof PERSONALITY_PROMPTS);
                        }}
                      >
                        <option value="" disabled>
                          Choose Personality
                        </option>
                        {Object.keys(PERSONALITY_PROMPTS).map((key) => (
                          <option key={key} value={key}>
                            {key}
                          </option>
                        ))}
                      </select>
                      &nbsp;&nbsp;
                      <PersonalityNamespaceDropdown setSelectedNamespace={handleNamespaceChange} />
                      &nbsp;&nbsp;
                      {selectedTheme === 'MultiModal' ? (
                        <>
                          <select
                            id="gender-select"
                            className={styles.dropdown}
                            disabled={loading}
                            value={gender}
                            onChange={(e) => setGender(e.target.value)}
                          >
                            <option value="" disabled>
                              Narrarator Voice Gender
                            </option>
                            <option value="FEMALE">Female Voice</option>
                            <option value="MALE">Male Voice</option>
                            <option value="NEUTRAL">Neutral Voice</option>
                          </select>
                          &nbsp;&nbsp;
                          <select
                            id="audio-language-select"
                            className={styles.dropdown}
                            disabled={loading}
                            value={audioLanguage}
                            onChange={(e) => setAudioLanguage(e.target.value)}
                          >
                            <option value="" disabled>
                              Audio Language
                            </option>
                            {audioLanguages.map((lang: Language) => (
                              <option key={lang.code} value={lang.code}> Speaking {lang.name}</option>
                            ))}
                          </select>
                          &nbsp;&nbsp;
                          <select
                            id="subtitle-language-select"
                            className={styles.dropdown}
                            disabled={loading}
                            value={subtitleLanguage}
                            onChange={(e) => setSubtitleLanguage(e.target.value)}
                          >
                            <option value="" disabled>
                              Subtitle Language
                            </option>
                            {subtitleLanguages.map((lang: Language) => (
                              <option key={lang.code} value={lang.code}> Subtitles {lang.name}</option>
                            ))}
                          </select>
                        </>
                      ) : null}
                    </div>
                    <div className={styles.cloudform}>
                      <TokensDropdown onChange={handleTokensChange} />
                      &nbsp;&nbsp;
                      <ModeDropdown onChange={handleIsStoryChange} />
                      &nbsp;&nbsp;
                      <ThemeDropdown onChange={handleThemeChange} />
                      &nbsp;&nbsp;
                      <DocumentDropdown onChange={handleDocumentsChange} />
                      &nbsp;&nbsp;
                      <EpisodeDropdown onChange={handleEpisodesChange} />
                    </div>
                  </div>
                  {/* Question/Topic text entry box */}
                  <div className={styles.cloudform}>
                    <textarea
                      disabled={loading || isSpeaking}
                      onKeyDown={handleEnter}
                      ref={textAreaRef}
                      autoFocus={true}
                      rows={2}
                      maxLength={1000000}
                      id="userInput"
                      name="userInput"
                      placeholder={
                        (selectedPersonality == 'Passthrough') ? 'Passthrough mode, replaying your input...' :
                          loading
                            ? isStory
                              ? `GAIB[${selectedPersonality}/${selectedNamespace}]: I am generating your story...`
                              : `GAIB[${selectedPersonality}/${selectedNamespace}]: I am thinking upon your question...`
                            : isStory
                              ? `Plotline direction: GAIB[${selectedPersonality}/${selectedNamespace}]: Tell GAIB a plotline of a story you would like to hear, speak or type it here. Change the various options below to customize your experience.`
                              : `Question topic: GAIB[${selectedPersonality}/${selectedNamespace}]: Ask GAIB a question, speak or type it here. Change the various options below to customize your experience.`
                      }
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        autoResize();
                      }}
                      className={styles.textarea}
                    />
                  </div>
                  {/* Personality prompt text entry box */}
                  <div className={styles.cloudform}>
                    <textarea
                      readOnly={loading || (selectedPersonality == 'Passthrough')}
                      ref={textAreaPersonalityRef}
                      id="customPrompt"
                      name="customPrompt"
                      maxLength={1500}
                      rows={2}
                      placeholder={
                        (selectedPersonality == 'Passthrough') ? 'Passthrough mode, personality is disabled.' :
                          (customPrompt != '') ? customPrompt : buildPrompt(selectedPersonality, isStory)
                      }
                      value={displayPrompt}
                      onChange={(e) => {
                        setCustomPrompt(e.target.value);
                        setDisplayPrompt(e.target.value);
                        autoResizePersonality();
                      }}
                      onFocus={(e) => {
                        if (customPrompt === '') {
                          setDisplayPrompt(buildPrompt(selectedPersonality, isStory));
                        }
                      }}
                      onBlur={(e) => {
                        if (customPrompt === '') {
                          setDisplayPrompt('');
                        }
                      }}
                      className={styles.textareaConfig}
                    />
                    </div>
                  {/* Question generator input text box */}
                  <div className={styles.cloudform}>
                    <div className={styles.cloudform}>
                      <textarea
                        readOnly={loading || (selectedPersonality == 'Passthrough')}
                        ref={textAreaCondenseRef}
                        id="condensePrompt"
                        name="condensePrompt"
                        maxLength={800}
                        rows={2}
                        placeholder={
                          (selectedPersonality == 'Passthrough') ? 'Passthrough mode, question/title generation is disabled.' :
                           (condensePrompt != '') ? condensePrompt : buildCondensePrompt(selectedPersonality, isStory)
                        }
                        value={displayCondensePrompt}
                        onChange={(e) => {
                          setCondensePrompt(e.target.value);
                          setDisplayCondensePrompt(e.target.value);
                          autoResizeCondense();
                        }}
                        onFocus={(e) => {
                          if (condensePrompt === '') {
                            setDisplayCondensePrompt(buildCondensePrompt(selectedPersonality, isStory));
                          }
                        }}
                        onBlur={(e) => {
                          if (condensePrompt === '') {
                            setDisplayCondensePrompt('');
                          }
                        }}
                        className={styles.textareaConfig}
                      />
                    </div>
                  </div>
                </form>
              </div>
            </div>
            {error && (
              <div className="border border-red-400 rounded-md p-4">
                <p className="text-red-500">{error}</p>
              </div>
            )}
          </main>
        </div>
      </Layout>
    </>
  );
}

export default Home;
