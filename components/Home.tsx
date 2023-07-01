import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/Home.module.css';
import { Message } from '@/types/chat';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import LoadingDots from '@/components/ui/LoadingDots';
import { Document } from 'langchain/document';
import { useSpeakText } from '@/utils/speakText';
import { PERSONALITY_PROMPTS } from '@/config/personalityPrompts';
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
import { useRouter } from 'next/router';
import Link from 'next/link';

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
        message: 'Welcome, I am The Groovy AI Bot GAIB!',
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
  const [showPopup, setShowPopup] = useState(false);
  const [subtitle, setSubtitle] = useState<string>('');
  const defaultGaib = process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE || '';
  const [imageUrl, setImageUrl] = useState<string>(defaultGaib);
  const [gender, setGender] = useState('FEMALE');
  const [selectedPersonality, setSelectedPersonality] = useState<keyof typeof PERSONALITY_PROMPTS>('Anime');
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
  const [isStory, setIsStory] = useState<boolean>(true);
  const [selectedTheme, setSelectedTheme] = useState<string>('Anime');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [documentCount, setDocumentCount] = useState<number>(3);
  const [episodeCount, setEpisodeCount] = useState<number>(1);
  const [news, setNews] = useState<Array<any>>([]);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [currentNewsIndex, setCurrentNewsIndex] = useState<number>(0);
  const isProcessingRef = useRef<boolean>(false);
  const [currentOffset, setCurrentOffset] = useState<number>(0);
  const [feedCategory, setFeedCategory] = useState<string>('');
  const [feedKeywords, setFeedKeywords] = useState<string>('');
  const [feedSort, setFeedSort] = useState<string>('popularity');
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [currentStory, setCurrentStory] = useState<StoryPart[]>([]);
  const router = useRouter();

  const isSubmittingRef = useRef(false);
  interface StoryPart {
    sentence: string;
    imageUrl: string;
  }

  const shareStory = async () => {
    try {
      console.log(`Current story: ${JSON.stringify(currentStory)}`);

      if (currentStory.length === 0) {
        console.log(`shareStory: No stories to share`);
        alert('Please generate a story first!');
        return;
      }
      const storyText = currentStory.map((item) => item.sentence).join('|');
      const imageUrls = currentStory.map((item) => item.imageUrl);

      console.log('Data being written:', {
        userId: user.uid,
        text: storyText,
        imageUrls: imageUrls,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
      console.log('ID of the current user:', user.uid);

      // Save the story to Firestore
      await firebase.firestore().collection('stories').add({
        userId: user.uid,
        text: storyText,
        imageUrls: imageUrls,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });

      // Clear the current story
      setCurrentStory([]);

      // Redirect the user to the global page
      router.push('/global');
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
          const body = currentNews[index].description.substring(0, 1000);
          const currentQuery = `${headline}\n\n${body}`;

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
  }, [isFetching, loading, isSpeaking, currentNewsIndex, news, setQuery, setCurrentNewsIndex, fetchNews, pending, query]);  // Remove isProcessing from the dependencies

  const togglePopup = () => {
    setShowPopup(!showPopup);
  };

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
        sentence = 'Anime AI Robot, quantum computing, and the meaning of life.';
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
          if (imageSource === 'pexels' && data.photos && data.photos.length > 0) {
            return {
              url: data.photos[0].src.large2x,
              photographer: data.photos[0].photographer,
              photographer_url: data.photos[0].photographer_url,
              pexels_url: data.photos[0].url,
            };
          } else if (imageSource === 'deepai' && data.output_url) {
            const imageUrl = data.output_url;
            if (saveImages === 'true') {
              const idToken = await user.getIdToken();
              // Store the image and index it
              await fetch('/api/storeImage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ imageUrl, prompt: sentence, episodeId: `${episodeId}_${count}`, imageUUID: imageId }),
              });
            }
            const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET_NAME || '';
            if (bucketName !== '') {
              return `https://storage.googleapis.com/${bucketName}/deepAIimage/${episodeId}_${count}_${imageId}.jpg`;
            } else {
              // don't store images in GCS
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

      console.log(`Response Speaker map: ${JSON.stringify(voiceModels)}`);
      console.log(`Gender Marked Names: ${JSON.stringify(genderMarkedNames)}`);

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

      // Merge sentences that are part of the same paragraph
      /*let mergedSentences: string[] = [];
      for (const sentence of sentences) {
        if (sentence.startsWith('*') || sentence.startsWith('-') || sentence.startsWith('SCENE:') || sentence.startsWith('Episode Title:') || sentence.startsWith('Question: ') || sentence.startsWith('Answer: ') || sentence.startsWith('Story Begins: ') || sentence.startsWith('Plotline: ') || sentence.startsWith('References: ') || sentence === '') {
          if (sentence !== '') {
            mergedSentences.push(sentence);
          }
        } else {
          if (mergedSentences.length > 0) {
            mergedSentences[mergedSentences.length - 1] += ' ' + sentence;
          } else {
            mergedSentences.push(sentence);
          }
        }
      }*/

      let count = 0;
      for (let sentence of sentences) {
        // Set the subtitle and wait for the speech to complete before proceeding to the next sentence
        if (lastMessageDisplayed != lastMessageIndex) {
          if (sentence == '---' || sentence == '') {
            continue;
          }
          // get the image for the sentence
          const imageSource = process.env.NEXT_PUBLIC_IMAGE_SERVICE || 'pexels'; // 'pexels' or 'deepai'
          if (!sentence.startsWith('References: ')
            && sentence !== ''
            && (imageSource == 'pexels'
              || (sentence.includes('SCENE:')
                || sentence.includes('Episode Title:')
                || sentence.includes('Question: ')
                || sentence.includes('Answer: ')
                || sentence.includes('Story Begins: ')
                || sentence.includes('Plotline: ')
                /*|| (sentence.startsWith('*') && sentence.length > 60)*/))) {
            let imageDescription = sentence;
            if (sceneIndex < sceneTexts.length || !sentence.includes('SCENE:')) {
              sentence = sentence.replace('[', '');
              sentence = sentence.replace(']', '');
              if (sentence.includes('SCENE:')) {
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
              setSubtitle(''); // Clear the subtitle
            }
            if (sentence.includes('SCENE:')) {
              //continue // GPT won't obey us and seems to not just make it a scene change, but part of the plot
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

          // Set the subtitle to the translated text if the text is not in English
          let translatedText = '';
          if (subtitleLanguage !== 'en-US') {
            translatedText = await fetchTranslation(sentence, subtitleLanguage);
            setSubtitle(splitSentence(translatedText));
          } else {
            setSubtitle(splitSentence(sentence));
          }

          let speakerChanged = false;
          // Check if sentence contains a name from genderMarkedNames
          for (const { name, marker } of genderMarkedNames) {
            const lcSentence = sentence.toLowerCase();
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
          if (!speakerChanged && (sentence.startsWith('*') || sentence.startsWith('-'))) {
            detectedGender = gender;
            currentSpeaker = 'GAIB';
            model = defaultModel;
            console.log(`Switched back to default voice. Gender: ${detectedGender}, Model: ${model}`);
            isSceneChange = true;  // Reset the scene change flag
          }

          // If the sentence starts with a parenthetical action or emotion, the speaker is continuing to speak
          if (sentence.startsWith('(') || (!sentence.startsWith('*') && !speakerChanged && !isSceneChange)) {
            isContinuingToSpeak = true;
          }

          // Speak the sentence if speech output is enabled
          if (speechOutputEnabled) {
            // Speak the sentence
            if (audioLanguage === 'en-US') {
              // Speak the original text
              if (debug) {
                console.log('Speaking as - ', detectedGender, '/', model, '/', audioLanguage, ' - Text: ', sentence);
              }
              const cleanText = removeMarkdownAndSpecialSymbols(sentence);
              if (cleanText !== '') {
                await speakText(cleanText, idToken, 1, detectedGender, audioLanguage, model);
              } else {
                // Wait anyways even if speaking fails so that the subtitles are displayed
                const sentenceLength = sentence.length;
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
                translationEntry = await fetchTranslation(sentence, audioLanguage);
              }
              if (debug) {
                console.log('Speaking as - ', detectedGender, '/', model, '/', audioLanguage, ' - Original Text: ', sentence, "\n Translation Text: ", translationEntry);
              }
              try {
                const cleanText = removeMarkdownAndSpecialSymbols(translationEntry);
                if (cleanText !== '') {
                  await speakText(translationEntry, idToken, 1, detectedGender, audioLanguage, model);
                } else {
                  // Wait anyways even if speaking fails so that the subtitles are displayed
                  const sentenceLength = sentence.length;
                  const waitTime = Math.min(Math.max(2000, sentenceLength * 100), 5000);
                  await new Promise(resolve => setTimeout(resolve, waitTime));
                }
              } catch (e) {
                console.log('Error speaking text: ', e);
                // Wait anyways even if speaking fails so that the subtitles are displayed
                const sentenceLength = sentence.length;
                const waitTime = Math.min(Math.max(2000, sentenceLength * 100), 5000);
                await new Promise(resolve => setTimeout(resolve, waitTime));
              }
            }
          } else {
            // Wait for the sentence to be spoken, measure sentence length to know how long to wait for
            const sentenceLength = sentence.length;
            const waitTime = Math.min(Math.max(2000, sentenceLength * 100), 5000);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
          // Set the last message displayed
          setLastMessageDisplayed(lastMessageIndex);
          // Update the last speaker
          lastSpeaker = currentSpeaker;
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
      if (autoFullScreen && !isFullScreen) {
        setIsFullScreen(true);
      }
      // Anime theme
      if (selectedTheme === 'Anime') {
        displayImagesAndSubtitles();
        setLastSpokenMessageIndex(lastMessageIndex);
      } else {
        setLastSpokenMessageIndex(lastMessageIndex);
        setIsSpeaking(false);
      }
    }
  }, [messages, speechOutputEnabled, speakText, stopSpeaking, autoFullScreen, isFullScreen, lastSpokenMessageIndex, imageUrl, setSubtitle, lastMessageDisplayed, gender, audioLanguage, subtitleLanguage, isPaused, isSpeaking, startTime, selectedTheme, isFetching, user, query]);

  // Speech recognition
  type SpeechRecognition = typeof window.SpeechRecognition;

  // Enable speech recognition toggle
  const handleSpeechOutputToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSpeechOutputEnabled(event.target.checked);
  };

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
    setIsSpeaking(true);
    setQuery('');
    setMessageState((state) => ({ ...state, pending: '' }));

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
          }
        },
      });
    } catch (error) {
      setLoading(false);
      setError('An error occurred while fetching the data. Please try again.');
      console.log(error);
    }
    isSubmittingRef.current = false;
  }

  // Handle the submit event on Enter
  const handleEnter = useCallback(
    (e: any) => {
      if (e.key === 'Enter' && !e.shiftKey && query) {
        if (autoFullScreen && !isFullScreen) {
          toggleFullScreen();
        }
        handleSubmit(e);
      } else if (e.key == 'Enter') {
        e.preventDefault();
      }
    },
    [query, autoFullScreen, isFullScreen],
  );

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
  const latestMessage: Message | PendingMessage | undefined = chatMessages[chatMessages.length - 1];

  // scroll to bottom of chat
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    if (messagesEndRef.current && messagesEndRef.current.scrollIntoView) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [latestMessage]);

  // Update the autoFullScreen state
  useEffect(() => {
    if (!isSpeaking && !loading && autoFullScreen && !isFullScreen) {
      toggleFullScreen();
    }
  }, [isSpeaking, autoFullScreen, loading, isFullScreen]);

  // Update the startSpeechRecognition function
  const startSpeechRecognition = () => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;
      recognition.timeout = 10000;

      // Update the listening state
      if (listening) {
        setStoppedManually(false);
        recognition.stop();
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
        if (transcript.includes("gabe") || transcript.includes("game")) {
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

  // pause speaking output
  const handlePause = () => {
    if (isPaused) {
      handleReplay();
      setIsPaused(false);
    } else {
      handleStop();
      setIsPaused(true);
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

  // replay the last spoken message
  const handleReplay = () => {
    // Find the last user message
    if (lastSpokenMessageIndex > 0) {
      // add a new message to the messages array with the last spoken message
      setMessageState((state) => ({
        ...state,
        messages: [
          ...state.messages,
          {
            type: 'apiMessage',
            message: state.messages[lastSpokenMessageIndex].message,
          },
        ],
      }));
    }
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

  // toggle the autoFullScreen state
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

  const handleNamespaceChange = (value: string) => {
    setSelectedNamespace(value);
  };

  const handleThemeChange = (value: string) => {
    setSelectedTheme(value);
  };

  useEffect(() => {
    autoResize();
  }, [query]); // re-run autoResize every time 'query' changes

  // handle the form submission
  return (
    <>
      <div className={styles.header}>
        <title>GAIB The Groovy AI Bot</title>
        <h1>GAIB The Groovy AI Bot</h1>
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
                  height: isFullScreen ? "100vh" : "480px",
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
                {selectedTheme === 'Anime' ? (
                  <div className={styles.generatedImage}>
                    {(imageUrl === '') ? "" : (
                      <div className={styles.generatedImage}>
                        <img
                          src={imageUrl}
                          alt="GAIB"
                        />
                      </div>
                    )}
                    <div className={
                      isFullScreen ? styles.fullScreenSubtitle : styles.subtitle
                    }>{subtitle}
                    </div>
                    {(imageUrl === '') ? "" : (
                      <div>
                        <PexelsCredit photographer={photographer} photographerUrl={photographerUrl} pexelsUrl={pexelsUrl} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.generatedImage}>
                    <div className={isFullScreen ? styles.fullScreenTerminal : styles.markdownanswer}>
                      <ReactMarkdown linkTarget="_blank">
                        {latestMessage.message}
                      </ReactMarkdown>
                      <div ref={messagesEndRef} /> {/* This div will be scrolled into view */}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.center}>
              <div className={styles.cloudform}>
                <form onSubmit={handleSubmit}>
                  <div className={styles.cloudform}>
                    <textarea
                      disabled={loading || isSpeaking}
                      onKeyDown={handleEnter}
                      ref={textAreaRef}
                      autoFocus={true}
                      rows={3}
                      maxLength={1000000}
                      id="userInput"
                      name="userInput"
                      placeholder={
                        loading
                          ? selectedPersonality === 'Anime'
                            ? 'GAIB is generating your Anime...'
                            : 'Thinking upon your question...'
                          : selectedPersonality === 'Anime'
                            ? 'Give me an Anime plotline to generate? Please end all spoken commands with "GAIB".'
                            : 'Give me a question to answer? Please end all spoken commands with "GAIB".'
                      }
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        autoResize();
                      }}
                      className={styles.textarea}
                    />
                  </div>
                  <div className={styles.buttoncontainer}>
                    <div className={styles.buttoncontainer}>
                      <div className={styles.buttoncontainer}>
                        <button
                          title="Submit prompt to GAIB"
                          type="submit"
                          disabled={loading || !selectedPersonality || isSpeaking}
                          onClick={(e) => {
                            e.preventDefault();
                            if (selectedPersonality) {
                              handleSubmit(e);
                            }
                          }}
                          className={styles.generatebutton}
                        >
                          {(loading || isSpeaking) ? (
                            <div className={styles.loadingwheel}>
                              <LoadingDots color="#FFA500" />
                            </div>
                          ) : (
                            // Send icon SVG in input field
                            <svg
                              viewBox="0 0 20 20"
                              className={styles.svgicon}
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
                            </svg>
                          )}
                        </button>
                        <button
                          title="Start Listening for Voice Commands"
                          type="button"
                          disabled={loading || isSpeaking}
                          className={`${styles.voicebutton} ${listening ? styles.listening : ''}`}
                          onClick={startSpeechRecognition}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            width="24"
                            height="24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={styles.svgicon}
                          >
                            <path d="M12 1v6m0 0v6m-6-6h12"></path>
                            <path d="M21 12v6a3 3 0 01-3 3h-12a3 3 0 01-3-3v-6"></path>
                            <path d="M3 15l1.8-1.8c1.1-1.1 2.8-1.1 3.9 0l1.2 1.2 1.2-1.2c1.1-1.1 2.8-1.1 3.9 0L21 15"></path>
                          </svg>
                        </button>

                        <button
                          title="Stop Voice"
                          type="button"
                          className={styles.stopvoicebutton}
                          onClick={handleStop}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            width="24"
                            height="24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={styles.svgicon}
                          >
                            <path d="M6 18L18 6M6 6l12 12"></path>
                          </svg>
                        </button>
                        {/*
                        <button
                          type="button"
                          disabled={loading || isSpeaking}
                          className={styles.replaybutton}
                          onClick={handleReplay}
                        >
                          {<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.svgicon}>
                            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.41 3.59 8 8 8s8-3.59 8-8-3.59-8-8-8z"></path>
                          </svg>
                          }
                        </button>
                        */}
                        <button
                          title="Clear Chat History"
                          type="button"
                          disabled={loading || isSpeaking}
                          className={styles.clearbutton}
                          onClick={handleClear}
                        >
                          {<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.svgicon}>
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M15 9l-6 6"></path>
                            <path d="M9 9l6 6"></path>
                          </svg>
                          }
                        </button>
                        <button
                          title="Save N Share"
                          onClick={shareStory}
                          type="button"
                          disabled={loading || isSpeaking}
                          className={styles.footer}
                        >Save N Share</button>&nbsp;&nbsp;|&nbsp;&nbsp;
                        <button
                          title="Save N Share"
                          onClick={handleFetchButtonClick}
                          className={styles.footer}
                          disabled={isSpeaking || loading}
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
                              Keywords (separated by spaces):
                              <input type="text" value={feedKeywords} onChange={e => setFeedKeywords(e.target.value)} />
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
                        </Modal>

                        {/*<select value={feedCategory} onChange={e => setFeedCategory(e.target.value)}>
                          {categoryOptions.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>

                        <select value={feedSort} onChange={e => setFeedSort(e.target.value)}>
                          {sortOptions.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                          </select>*/}
                        {/*
                        <button
                          title="Pause"
                          type="button"
                          className={styles.pausebutton}
                          onClick={handlePause}
                        >
                          {<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.svgicon}>
                            <rect x="4" y="6" width="16" height="4"></rect>
                            <rect x="4" y="14" width="16" height="4"></rect>
                          </svg>
                        </button>
                        */}
                        {/*<label className={styles.label}>
                          <input
                            title="Speaking Enabled"
                            type="checkbox"
                            checked={speechOutputEnabled}
                            onChange={handleSpeechOutputToggle}
                          />
                          &nbsp;&nbsp;Speak
                      </label>*/}
                        {/*<label htmlFor="auto-full-screen">
                          <input
                            title="Auto full screen on play"
                            type="checkbox"
                            checked={autoFullScreen}
                            onChange={(e) => setAutoFullScreen(e.target.checked)}
                          />
                           &nbsp;&nbsp; <b>Auto full screen on play</b>
                          </label>*/}
                      </div>
                    </div>
                    <div className={styles.dropdowncontainer}>
                      <div className={styles.dropdowncontainer}>
                        <div className={styles.labelContainer}>
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
                        </div>
                        <div className={styles.labelContainer}>
                          <PersonalityNamespaceDropdown setSelectedNamespace={handleNamespaceChange} />
                        </div>
                        {selectedTheme === 'Anime' ? (
                          <><div className={styles.labelContainer}>
                            <select
                              id="gender-select"
                              className={styles.dropdown}
                              disabled={isSpeaking || loading}
                              value={gender}
                              onChange={(e) => setGender(e.target.value)}
                            >
                              <option value="" disabled>
                                Choose Voice Gender
                              </option>
                              <option value="FEMALE">Female</option>
                              <option value="MALE">Male</option>
                              <option value="NEUTRAL">Neutral</option>
                            </select>
                          </div><div className={styles.labelContainer}>
                              <select
                                id="audio-language-select"
                                className={styles.dropdown}
                                disabled={loading}
                                value={audioLanguage}
                                onChange={(e) => setAudioLanguage(e.target.value)}
                              >
                                <option value="" disabled>
                                  Choose Audio Language
                                </option>
                                {audioLanguages.map((lang: Language) => (
                                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                                ))}
                              </select>
                            </div><div className={styles.labelContainer}>
                              <select
                                id="subtitle-language-select"
                                className={styles.dropdown}
                                disabled={loading}
                                value={subtitleLanguage}
                                onChange={(e) => setSubtitleLanguage(e.target.value)}
                              >
                                <option value="" disabled>
                                  Choose Subtitle Language
                                </option>
                                {subtitleLanguages.map((lang: Language) => (
                                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                                ))}
                              </select>
                            </div></>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.labelContainer}>
                      <TokensDropdown onChange={handleTokensChange} />
                      <ModeDropdown onChange={handleIsStoryChange} />
                      <ThemeDropdown onChange={handleThemeChange} />
                      <DocumentDropdown onChange={handleDocumentsChange} />
                      <EpisodeDropdown onChange={handleEpisodesChange} />
                    </div>
                    <div className={styles.labelContainer}>
                      <button title="View Transcript"
                        type="button"
                        onClick={togglePopup}
                        className={`${styles.copyButton} ${styles.shrinkedButton}`}
                      >
                        <svg
                          className={`${styles.documentIcon} ${styles.centeredSvg}`}
                          width="24"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M19 3H9C7.89543 3 7 3.89543 7 5V19C7 20.1046 7.89543 21 9 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3ZM17 19H11V17H17V19ZM17 15H11V13H17V15ZM17 11H11V9H17V11ZM17 7H11V5H17V7Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                      {showPopup && (
                        <div className="popup" onClick={togglePopup}>
                          <div
                            className="popupContent"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <pre className={styles.preWrap}>{latestMessage.message}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className={styles.labelContainer}>
                      <Link href="/global" className={styles.header}>
                        <a>GAIB Shared Story Archive</a>
                      </Link>
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
