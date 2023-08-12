import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/Home.module.css';
import { Message } from '@/types/chat';
import { Story, Episode, Scene } from '@/types/story';
import { Document } from 'langchain/document';
import { useSpeakText } from '@/utils/speakText';
import {
  PERSONALITY_PROMPTS,
  buildPrompt,
  buildCondensePrompt,
} from '@/config/personalityPrompts';
import { audioLanguages, subtitleLanguages, Language } from "@/config/textLanguages";
import nlp from 'compromise';
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
import copy from 'copy-to-clipboard';
import EpisodePlanner from '@/components/EpisodePlanner';
import GPT3Tokenizer from 'gpt3-tokenizer';
import { fetchEventSourceWithAuth, fetchWithAuth } from '@/utils/fetchWithAuth';
import ModelNameDropdown from '@/components/ModelNameDropdown';
import FastModelNameDropdown from '@/components/FastModelNameDropdown';

const tokenizer = new GPT3Tokenizer({ type: 'gpt3' });
const debug = process.env.NEXT_PUBLIC_DEBUG ? process.env.NEXT_PUBLIC_DEBUG === 'true' : false;

// Add a type for the user prop
interface HomeProps {
  user: firebase.User | null;
}

function Home({ user }: HomeProps) {
  const [query, setQuery] = useState<string>('');
  const [voiceQuery, setVoiceQuery] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [messageState, setMessageState] = useState<{
    messages: Message[];
    pending?: string;
    history: [string, string][];
    pendingSourceDocs?: Document[];
  }>({
    messages: [],
    history: [],
    pendingSourceDocs: [],
  });

  const { messages, pending, history, pendingSourceDocs } = messageState;
  const { speakText, stopSpeaking, speakAudioUrl } = useSpeakText();

  const [listening, setListening] = useState<boolean>(false);
  const [stoppedManually, setStoppedManually] = useState<boolean>(true);
  const [speechRecognitionComplete, setSpeechRecognitionComplete] = useState(false);
  const [speechOutputEnabled, setSpeechOutputEnabled] = useState(true);
  const [timeoutID, setTimeoutID] = useState<NodeJS.Timeout | null>(null);

  const messageListRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const textAreaCondenseRef = useRef<HTMLTextAreaElement>(null);
  const textAreaPersonalityRef = useRef<HTMLTextAreaElement>(null);
  const [subtitle, setSubtitle] = useState<string>(`I am Groovy\nI can tell you a story or answer any questions.`);
  const [loadingOSD, setLoadingOSD] = useState<string>('Waiting for your ideas...');
  const defaultGaib = process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE || '';
  const [imageUrl, setImageUrl] = useState<string>(defaultGaib);
  const [gender, setGender] = useState('FEMALE');
  const [selectedPersonality, setSelectedPersonality] = useState<keyof typeof PERSONALITY_PROMPTS>('groovy');
  const [selectedNamespace, setSelectedNamespace] = useState<string>('groovypdf');
  const [audioLanguage, setAudioLanguage] = useState<string>("en-US");
  const [subtitleLanguage, setSubtitleLanguage] = useState<string>("en-US");
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [tokensCount, setTokensCount] = useState<number>(0);
  const [isStory, setIsStory] = useState<boolean>(false);
  const [selectedTheme, setSelectedTheme] = useState<string>('MultiModal');
  const [documentCount, setDocumentCount] = useState<number>(1);
  const [episodeCount, setEpisodeCount] = useState<number>(1);
  const [news, setNews] = useState<Array<any>>([]);
  const [isFetching, setIsFetching] = useState<boolean>(true);
  const [currentNewsIndex, setCurrentNewsIndex] = useState<number>(0);
  const isProcessingRef = useRef<boolean>(false);
  const isProcessingTwitchRef = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  const [currentOffset, setCurrentOffset] = useState<number>(0);
  const [feedCategory, setFeedCategory] = useState<string>('');
  const [feedKeywords, setFeedKeywords] = useState<string>('');
  const [feedPrompt, setFeedPrompt] = useState<string>('');
  const [feedSort, setFeedSort] = useState<string>('popularity');
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [condensePrompt, setCondensePrompt] = useState<string>('');
  const [displayPrompt, setDisplayPrompt] = useState('');
  const [displayCondensePrompt, setDisplayCondensePrompt] = useState('');
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [playQueue, setPlayQueue] = useState<Story[]>([]);
  const [submitQueue, setSubmitQueue] = useState<Episode[]>([]);
  const [storyQueue, setStoryQueue] = useState<Story[]>([]);
  const isDisplayingRef = useRef<boolean>(false);
  const [feedNewsChannel, setFeedNewsChannel] = useState<boolean>(false);
  const [translateText, setTranslateText] = useState<boolean>(process.env.NEXT_PUBLIC_ENABLE_TRANSLATE === 'true');
  const [newsFeedEnabled, setNewsFeedEnabled] = useState<boolean>(process.env.NEXT_PUBLIC_ENABLE_NEWS_FEED === 'true');
  const [authEnabled, setAuthEnabled] = useState<boolean>(process.env.NEXT_PUBLIC_ENABLE_AUTH === 'true');
  const [channelId, setChannelId] = useState(process.env.NEXT_PUBLIC_TWITCH_CHANNEL_ID || '');
  const [twitchChatEnabled, setTwitchChatEnabled] = useState(false);
  const episodeIdRef = useRef<string>(uuidv4());
  const [conversationHistory, setConvesationHistory] = useState<any[]>([]);
  const [lastStory, setLastStory] = useState<string>('');
  const [maxQueueSize, setMaxQueueSize] = useState<number>(process.env.NEXT_PUBLIC_MAX_QUEUE_SIZE ? Number(process.env.NEXT_PUBLIC_MAX_QUEUE_SIZE) : 3);
  const [modelName, setModelName] = useState<string>(process.env.MODEL_NAME || 'gpt-3.5-turbo');
  const [fastModelName, setFastModelName] = useState<string>(process.env.QUESTION_MODEL_NAME || 'gpt-3.5-turbo');

  function countTokens(textString: string): number {
    let totalTokens = 0;

    const encoded = tokenizer.encode(textString);
    totalTokens += encoded.bpe.length;

    return totalTokens;
  }

  const postResponse = async (channel: string, message: string, userId: string | undefined) => {
    const response = await fetchWithAuth('/api/addResponse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, message, userId }),
    });

    if (!response.ok) {
      throw new Error('Failed to post response');
    }
  };

  // Declare a new ref for start word detection
  const startWordDetected = useRef(false);

  // Declare a new ref for stop word detection
  const stopWordDetected = useRef(false);

  // Declare a new ref for timeout detection
  const timeoutDetected = useRef(false);

  // handleSubmit queue episode function
  const isSubmittingRef = useRef(false);

  // handleSubmitQueue useeffect lock
  const isSubmitQueueRef = useRef(false);

  // Declare a reference to the speech recognition object
  let recognition: SpeechRecognition | null = null;

  // Speech recognition
  type SpeechRecognition = typeof window.SpeechRecognition;

  const copyStory = async () => {
    copy(latestMessage.message);
    alert('Story copied to clipboard!');
  };

  const handleShareStory = async (event: { preventDefault: () => void; }) => {
    event.preventDefault();
    if (lastStory !== '') {
      alert(`Story shared successfully to ${lastStory}!`);
      copy(`${lastStory}`);
    } else {
      alert('Please generate a story first!');
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

  // This function will be passed to the EpisodePlanner component
  const handleNewEpisode = (episode: Episode) => {
    episode = parseQuestion(episode); // parse the question
    setEpisodes([...episodes, episode]);
  };

  const handleEpisodeChange = (newEpisodes: Episode[]) => {
    setEpisodes(newEpisodes);
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
    setNews([]); // Clear the news feed
    setIsFetching(true);
  };

  // Twitch Chat fetching for automating input via a Twitch chat (costs if runs too much, watch out!!!)
  useEffect(() => {
    let isProcessing = false;

    async function fetchEpisodeData() {
      const idToken = await user?.getIdToken();
      try {
        if (debug) {
          console.log(`fetchEpisodeData: Fetching documents for channel ${channelId} and user ${user?.uid}...`);
        }
        const res = await fetchWithAuth(`/api/commands?channelName=${channelId}&userId=${user?.uid}`,
          {
            headers: {
              'Content-Type': 'application/json',
            },
          });

        if (res.status !== 200) {
          if (res.status === 401) {
            console.log(`fetchEpisodeData: User ${user?.uid} is not authorized to access channel ${channelId}.`);
            return;
          } else if (res.status === 404) {
            if (debug) {
              console.log(`fetchEpisodeData: Channel ${channelId} doesn't have any data.`);
            }
            return;
          }
          console.error(`fetchEpisodeData: An error occurred in the fetchEpisodeData function: ${res.statusText}`);
          return;
        }
        const data = await res.json();

        if (data.length === 0 || data.error == 'No commands found') {
          if (debug) {
            console.log(`fetchEpisodeData: No documents found for channel ${channelId} and user ${user?.uid}`);
          }
          return;
        }
        console.log(`fetchEpisodeData: Found ${data.length} documents for channel ${channelId} and user ${user?.uid}.`);

        const newEpisodes: Episode[] = data.map((item: any) => ({
          title: item.title,
          // Add any other necessary fields here
          type: item.type,
          username: item.username,
          timestamp: item.timestamp,
          namespace: item.namespace,
          personality: item.personality,
          prompt: item.prompt,
          refresh: item.refresh,
          sourceDocs: [],
          documentCount: documentCount,
          episodeCount: episodeCount,
          gptModel: modelName,
          gptFastModel: fastModelName,
          gptPrompt: buildPrompt(selectedPersonality as keyof typeof PERSONALITY_PROMPTS, isStory),
          defaultGender: gender,
          speakingLanguage: audioLanguage,
          subtitleLanguage: subtitleLanguage,
        }));

        // Add the new episodes to the episodes array
        console.log(`fetchEpisodeData: Adding ${newEpisodes.length} new episodes to the episodes array...`);
        // fix up each episode
        let filledEpisodes: Episode[] = [];
        newEpisodes.forEach((episode: Episode) => {
          episode = parseQuestion(episode); // parse the question
          if (episode.title != '') {
            if (episode.personality == '') {
              episode.personality = selectedPersonality;
            }
            if (episode.namespace == '') {
              episode.namespace = selectedNamespace;
            }
            filledEpisodes.push(episode);
          } else {
            console.log(`fetchEpisodeData: Skipping empty episode: ${JSON.stringify(episode)}`);
          }
        });

        setEpisodes([...episodes, ...filledEpisodes]);
      } catch (error) {
        console.error('fetchEpisodeData: An error occurred in the fetchEpisodeData function:', error);
      }
    }

    const processTwitchChat = async () => {
      if (isProcessing) return;  // If a fetch is already in progress, do nothing
      isProcessing = true;  // Set the flag to true to block other fetches

      if (isFetching && channelId !== '' && twitchChatEnabled && !isProcessingTwitchRef.current) {
        isProcessingTwitchRef.current = true;
        try {
          await fetchEpisodeData();
        } catch (error) {
          console.error('An error occurred in the fetchEpisodeData function:', error); // Check for any errors
        }
        isProcessingTwitchRef.current = false;
      }
      isProcessing = false;  // Reset the flag once the fetch is complete
    };

    try {
      processTwitchChat();  // Run immediately on mount
    } catch (error) {
      console.error('An error occurred in the fetchEpisodeData function:', error); // Check for any errors
    }

    // check if there are any episodes left, if so we don't need to sleep
    const intervalId = setInterval(processTwitchChat, 30000);  // Then every N seconds

    return () => clearInterval(intervalId);  // Clear interval on unmount
  }, [channelId, twitchChatEnabled, isFetching, episodes, user, isProcessingTwitchRef, isSubmittingRef, selectedPersonality, selectedNamespace, parseQuestion]);

  // News fetching for automating input via a news feed
  useEffect(() => {
    const processNewsArticle = async () => {
      if (isFetching && !isProcessingRef.current && feedNewsChannel && newsFeedEnabled && episodes.length <= 0) {
        isProcessingRef.current = true;

        let currentNews = news;
        let index = currentNewsIndex;

        const fetchNews = async () => {
          const res = await fetchWithAuth(`/api/mediastack?offset=${currentOffset}&sort=${feedSort}&category=${feedCategory}&keywords=${feedKeywords}`, {
            headers: {
              'Content-Type': 'application/json',
            },
          });
          if (!res.ok) {
            console.log('Error fetching news: ', res.statusText);
            return [];
          }
          const data = await res.json();
          setCurrentOffset(currentOffset + 100);
          return data.data;
        };

        if (index >= currentNews.length || currentNews.length === 0) {
          try {
            currentNews = await fetchNews();
            console.log(`Fetching news: found ${currentNews.length} news articles`);
            setNews(currentNews);
            index = 0;
          } catch (error) {
            console.error('An error occurred in the fetchNews function:', error);
          }
        }

        try {
          if (currentNews.length > 0 && index < currentNews.length) {
            const headline = currentNews[index].title;
            const body = currentNews[index].description.substring(0, 300);
            let currentQuery = `${headline}\n\n${body}`;

            if (feedPrompt != '') {
              currentQuery = `${currentQuery}\nNews:\n${feedPrompt}\n\n`;
            }

            let episode: Episode = {
              title: headline + ' ' + body,
              type: isStory ? 'episode' : 'question',
              username: 'news',
              namespace: selectedNamespace,
              personality: selectedPersonality,
              refresh: false,
              prompt: '',
              sourceDocs: [],
              documentCount: documentCount,
              episodeCount: episodeCount,
              gptModel: modelName,
              gptFastModel: fastModelName,
              gptPrompt: buildPrompt(selectedPersonality as keyof typeof PERSONALITY_PROMPTS, isStory),
              defaultGender: gender,
              speakingLanguage: audioLanguage,
              subtitleLanguage: subtitleLanguage,
            }
            console.log(`Queing News headline #${index}: ${headline}`);
            episode = parseQuestion(episode); // parse the question
            setEpisodes([...episodes, episode]);

            setCurrentNewsIndex(index + 1);
          } else {
            setCurrentOffset(currentOffset + 100);
            setCurrentNewsIndex(0);
            currentNews = await fetchNews();
          }
        } catch (error) {
          console.error('An error occurred in the processNewsArticle function:', error);
        }

        isProcessingRef.current = false;
      }
    };

    try {
      processNewsArticle();  // Run immediately on mount
    } catch (error) {
      console.error('An error occurred in the processNewsArticle function:', error);
      isProcessingRef.current = false;
    }

    const intervalId = setInterval(processNewsArticle, 30000);  // Then every N seconds

    return () => clearInterval(intervalId);  // Clear interval on unmount
  }, [isFetching, currentNewsIndex, news, setCurrentNewsIndex, feedPrompt, episodes, isStory, feedNewsChannel, newsFeedEnabled, isProcessingRef, currentOffset, feedCategory, feedKeywords, feedSort, maxQueueSize, selectedNamespace, selectedPersonality, parseQuestion]);

  // handle the submitQueue of episodes
  useEffect(() => {
    const submitQueueDisplay = async () => {
      if (debug) {
        console.log(`submitQueueDisplay: Submitting ${episodes.length} episodes...`);
      }
      if (episodes.length > 0 && !isSubmitQueueRef.current) {
        isSubmitQueueRef.current = true;
        let localEpisode: Episode = episodes.shift() as Episode;  // Get the first episode
        if (localEpisode) {
          localEpisode = parseQuestion(localEpisode); // parse the question
        } else {
          console.log(`submitQueueDisplay: No localEpisode found`);
        }

        if (localEpisode) {
          // Use messages as history
          let localHistory = [...messages];
          let titleArray: string[] = [];
          let tokens: number = 0;
          let newMessages = [...messages];  // Create a local copy of messages
          let pendingMessage = '';
          let pendingSourceDocs: any;

          // History refresh request
          if (localEpisode.refresh !== undefined && localEpisode.refresh == true) {
            localHistory = [];
          }

          // setup the story structure
          let story: Story = {
            title: '',
            url: '',
            thumbnailUrls: [],
            id: '',
            UserId: localEpisode.username,
            prompt: localEpisode.prompt,
            tokens: tokens,
            scenes: [],
            imageUrl: '',
            imagePrompt: '',
            timestamp: Date.now(),
            personality: localEpisode.personality,
            namespace: localEpisode.namespace,
            references: [],
            isStory: localEpisode.type === 'episode' ? true : false,
            shareUrl: '',
            rawText: '',
            query: localEpisode.title,
            documentCount: documentCount,
            episodeCount: episodeCount,
            gptModel: modelName,
            gptFastModel: fastModelName,
            gptPrompt: buildPrompt(localEpisode.personality as keyof typeof PERSONALITY_PROMPTS, localEpisode.type === 'episode' ? true : false),
            defaultGender: gender,
            speakingLanguage: audioLanguage,
            subtitleLanguage: subtitleLanguage,
          }

          try {
            console.log(`SubmitQueue: Submitting Recieved ${localEpisode.type} #${episodes.length}: ${localEpisode.title}`);
            // create the titles and parts of an episode
            if (localEpisode.type == 'episode') {
              titleArray.push(localEpisode.title);
            } else {
              titleArray.push(localEpisode.title);
            }

            console.log(`handleSubmit: history is ${JSON.stringify(localHistory.length > 0 ? localHistory[localHistory.length - 1] : localHistory, null, 2)}`);
            console.log(`handleSubmit: Submitting question: '${localEpisode.title.slice(0, 1000)}...'`);

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
                  localPersonality: localEpisode?.personality,
                  message: localEpisode ? localEpisode.title : '',
                },
              ],
              pending: undefined,
            }));

            // Reset the state
            setError(null);
            setLoadingOSD(`Recieved ${localEpisode.type}: ${localEpisode.title.slice(0, 50).replace(/\n/g, ' ')}...`);
            setMessageState((state) => ({ ...state, pending: '' }));

            // Send the question to the server
            const fetchData = async () => {
              return new Promise<void>((resolve, reject) => {
                const ctrl = new AbortController();
                try {
                  fetchEventSourceWithAuth('/api/chat', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Retry-After': '5',
                    },
                    body: JSON.stringify({
                      question: localEpisode.title,
                      userId: user?.uid,
                      localPersonality: localEpisode.personality ? localEpisode.personality : selectedPersonality,
                      selectedNamespace: localEpisode.namespace ? localEpisode.namespace : selectedNamespace,
                      isStory: localEpisode.type === 'episode' ? true : false,
                      customPrompt,
                      condensePrompt,
                      commandPrompt: localEpisode.prompt ? localEpisode.prompt : '',
                      modelName: modelName,
                      fastModelName: fastModelName,
                      tokensCount,
                      documentCount,
                      episodeCount,
                      titleArray,
                      history: localHistory,
                    }),
                    signal: ctrl.signal,
                    onmessage: (event: { data: string; }) => {
                      if (event.data === '[DONE]' || event.data === '[ERROR]') {
                        const newMessage: Message = {
                          type: 'apiMessage',
                          message: pendingMessage,
                          sourceDocs: pendingSourceDocs,
                        };
                        newMessages = [...newMessages, newMessage];
                        setMessageState((state) => ({
                          history: [],
                          messages: newMessages,
                          sourceDocs: pendingSourceDocs,
                          pending: undefined,
                          pendingSourceDocs: undefined,
                        }));
                     
                        ctrl.abort();
                        resolve();
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
                        setLoadingOSD('System Error... Please try again.');
                        ctrl.abort();
                        resolve();
                      } else {
                        const data = JSON.parse(event.data);
                        try {
                          if (data.sourceDocs) {
                            console.log(`handleSubmit: Recieved ${data.sourceDocs.length} sourceDocs ${JSON.stringify(data.sourceDocs)}}`);
                            pendingSourceDocs = data.sourceDocs;
                          } else {
                            pendingMessage += data.data;
                          }
                        } catch (error) {
                          console.error('An error occurred in the handleSubmitQueue function:', error); // Check for any errors
                        }
                        if (data.data) {
                          tokens = tokens + countTokens(data.data);
                          setLoadingOSD(`Loading: ${tokens} GPT tokens generated...`);
                        } else {
                          console.log(`handleSubmitQueue: No data returned from the server.`);
                        }
                      }
                    },
                  });
                } catch (error: any) {
                  reject(error);
                }
              });
            };

            await fetchData();
          } catch (error) {
            console.error('An error occurred in the handleSubmitQueue function:', error); // Check for any errors
            if (localEpisode) {
              episodes.unshift(localEpisode); // Put the episode back in the queue
            }
          }

          console.log(`storyQueue: messages length ${newMessages.length} contain\n${JSON.stringify(newMessages, null, 2)}`)

          // collect the story raw text and references 
          story.rawText = pendingMessage;
          story.references = pendingSourceDocs;

          setStoryQueue([...storyQueue, story]);
        }
        isSubmitQueueRef.current = false;
      }
    };

    submitQueueDisplay();  // Run immediately on mount

    // check if there are any episodes left, if so we don't need to sleep
    const intervalId = setInterval(() => {
      if (!isSubmitQueueRef.current) {
        submitQueueDisplay();
      }
    }, 1000);  // Then every N seconds

    return () => clearInterval(intervalId);  // Clear interval on unmount
  }, [submitQueue, isFetching, isSpeaking, isProcessingRef, isSubmittingRef, listening, episodes]);

  // Playback Queue processing of stories after they are generated
  useEffect(() => {
    const playQueueDisplay = async () => {
      if (playQueue.length > 0 && !isSpeaking && !isDisplayingRef.current) {
        const playStory = playQueue[0];  // Get the first story
        try {
          console.log(`PlayQueaue: Displaying Recieved Story #${playQueue.length}: ${playStory.title}\n${JSON.stringify(playStory)}\n`);

          isDisplayingRef.current = true;
          setIsSpeaking(true);

          setSubtitle(`Title: ${playStory.title}`); // Clear the subtitle
          setLoadingOSD(`Prompt: ${playStory.prompt}\nShared to: ${playStory.shareUrl}\n${playStory.tokens} Tokens ${playStory.isStory ? 'Story' : 'Question'} ${playStory.personality} ${playStory.namespace}\n${playStory.references && playStory.references.join(', ')}`);
          setLastStory(playStory.shareUrl);
          setImageUrl(playStory.imageUrl);

          // This function needs to be async to use await inside
          async function playScenes() {
            // parse the playStory and display it as subtitles, images, and audio, use speakAudioUrl(url) to play the audio
            for (let scene of playStory.scenes) {
              for (let sentence of scene.sentences) {
                console.log(`PlayQueue: Displaying Sentence #${sentence.id}: ${sentence.text}\n${JSON.stringify(sentence)}\nImage: ${sentence.imageUrl})\n`)
                if (sentence.text != '') {
                  setSubtitle(sentence.text);
                  setLoadingOSD(`Building ${playStory.scenes.length} Scenes for ${playStory.title}.`);
                } else {
                  setLoadingOSD('');
                }
                if (sentence.imageUrl != '' && sentence.imageUrl != null && sentence.imageUrl != undefined && typeof sentence.imageUrl != 'object') {
                  setImageUrl(sentence.imageUrl);
                }
                if (sentence.audioFile != '' && sentence.audioFile.match(/\.mp3$/)) {
                  try {
                    const response = await fetch(sentence.audioFile, { method: 'HEAD' });
                    if (response.ok) {
                      try {
                        await speakAudioUrl(sentence.audioFile);
                        console.log("Audio played successfully");
                      } catch (error) {
                        console.error(`PlaybackDisplay: An error occurred while playing ${sentence.audioFile}:\n${error}`);
                      }
                    } else {
                      console.error(`File not found at ${sentence.audioFile}`);
                    }
                  } catch (error) {
                    console.error(`PlaybackDisplay: An error occurred while fetching ${sentence.audioFile}:\n${error}`);
                  }
                }
              }
            }
          }

          // Call the function
          await playScenes();

          setPlayQueue(prevQueue => prevQueue.slice(1));  // Remove the first story from the queue

          isDisplayingRef.current = false;
          setIsSpeaking(false);
        } catch (error) {
          console.error('An error occurred in the processQueue function:', error); // Check for any errors
          isDisplayingRef.current = false;
          setIsSpeaking(false);
        }
        // Reset the subtitle after all sentences have been spoken
        stopSpeaking();
        setSubtitle(`I am ${selectedPersonality.toUpperCase()}\nI can tell you a story or answer any questions.`);

        setLoadingOSD(`Finished playing ${playStory.title}. `);
      }
    };

    playQueueDisplay();  // Run immediately on mount

    // check if there are any episodes left, if so we don't need to sleep
    const intervalId = setInterval(playQueueDisplay, 3000);  // Then every N seconds

    return () => clearInterval(intervalId);  // Clear interval on unmount
  }, [playQueue, isSpeaking, isDisplayingRef, stopSpeaking, speakAudioUrl, setSubtitle, setIsSpeaking, setLoadingOSD, setImageUrl, setLastStory]);

  // Generate a new story when the query input has been added to
  useEffect(() => {
    if (!isSpeakingRef.current && storyQueue.length > 0) {
      isSpeakingRef.current = true;

      // last message set to mark our position in the messages array
      let story: Story | undefined = storyQueue.shift();

      console.log(`StoryQueue: Generating Story #${storyQueue.length}: ${story?.title}\n${JSON.stringify(story)}\n`);

      // lock speaking and avoid crashing
      try {
        let lastImage: string = '';

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

        async function getGaib() {
          const directoryUrl = process.env.NEXT_PUBLIC_GAIB_IMAGE_DIRECTORY_URL;
          const maxNumber = Number(process.env.NEXT_PUBLIC_GAIB_IMAGE_MAX_NUMBER);
          let randomNumber = 0;
          if (maxNumber > 1) {
            randomNumber = (maxNumber && maxNumber > 1) ? Math.floor(Math.random() * maxNumber) + 1 : -1;
          } else {
            randomNumber = maxNumber;
          }

          let url = process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE || '';
          if (directoryUrl != null && maxNumber >= 1 && randomNumber >= 0) {
            url = `${directoryUrl}/${randomNumber}.png`;
          }
          return url;
        }

        // Choose Pexles, DeepAI or local images
        async function generateImageUrl(sentence: string, useImageAPI = true, lastImage: string = '', localEpisodeId = '', count = 0): Promise<string> {
          const imageSource = (process.env.NEXT_PUBLIC_IMAGE_SERVICE || 'pexels') as 'pexels' | 'deepai' | 'openai' | 'getimgai';
          const saveImages = process.env.NEXT_PUBLIC_ENABLE_IMAGE_SAVING || 'false';

          // check if enabled
          if (process.env.NEXT_PUBLIC_ENABLE_IMAGES !== 'true') {
            return '';
          }

          // Check if it has been 5 seconds since we last generated an image
          const endTime = new Date();
          const deltaTimeInSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
          if (deltaTimeInSeconds < 1 && messages.length > 0) {
            console.log(`generateImageUrl: has been ${deltaTimeInSeconds} seconds since last image generation.`);
          }
          setStartTime(endTime);

          if (sentence === '') {
            sentence = '';
            return '';
          }

          let keywords = '';

          // Use local images if requested else use Pexels API to fetch images
          if (!useImageAPI) {
            // use local images
            return await getGaib();
          } else {
            try {
              let response;
              if (imageSource === 'pexels') {
                let extracted_keywords = extractKeywords(sentence, 32).join(' ');
                console.log('Extracted keywords: [', extracted_keywords, ']');
                keywords = encodeURIComponent(extracted_keywords);
                response = await fetchWithAuth('/api/pexels', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ keywords }),
                });
              } else if (imageSource === 'deepai') {
                let exampleImage = '' as string;
                if (process.env.NEXT_PUBLIC_IMAGE_GENERATION_EXAMPLE_IMAGE && process.env.NEXT_PUBLIC_IMAGE_GENERATION_EXAMPLE_IMAGE === 'true') {
                  if (lastImage !== '') {
                    exampleImage = lastImage;
                  } else {
                    exampleImage = await getGaib();
                  }
                }
                response = await fetchWithAuth('/api/deepai', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: `${sentence}`, negative_prompt: 'blurry, cropped, watermark, unclear, illegible, deformed, jpeg artifacts, writing, letters, numbers, cluttered', imageUrl: exampleImage }),
                });
              } else if (imageSource === 'openai') {
                let exampleImage = '' as string;
                if (process.env.NEXT_PUBLIC_IMAGE_GENERATION_EXAMPLE_IMAGE && process.env.NEXT_PUBLIC_IMAGE_GENERATION_EXAMPLE_IMAGE === 'true') {
                  if (lastImage !== '') {
                    exampleImage = lastImage;
                  } else {
                    exampleImage = await getGaib();
                  }
                }
                response = await fetchWithAuth('/api/openai', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: `${sentence.trim().replace('\n', ' ').slice(0, 800)}` }),
                });
              } else if (imageSource === 'getimgai') {
                const idToken = await user?.getIdToken();
                let model = process.env.NEXT_PUBLIC_GETIMGAI_MODEL || 'stable-diffusion-v2-1';
                let negativePrompt = process.env.NEXT_PUBLIC_GETIMGAI_NEGATIVE_PROMPT || 'blurry, cropped, watermark, unclear, illegible, deformed, jpeg artifacts, writing, letters, numbers, cluttered';
                let width = process.env.NEXT_PUBLIC_GETIMGAI_WIDTH ? parseInt(process.env.NEXT_PUBLIC_GETIMGAI_WIDTH) : 512;
                let height = process.env.NEXT_PUBLIC_GETIMGAI_HEIGHT ? parseInt(process.env.NEXT_PUBLIC_GETIMGAI_HEIGHT) : 512;
                let steps = process.env.NEXT_PUBLIC_GETIMGAI_STEPS ? parseInt(process.env.NEXT_PUBLIC_GETIMGAI_STEPS) : 25;
                let guidance = process.env.NEXT_PUBLIC_GETIMGAI_GUIDANCE ? parseFloat(process.env.NEXT_PUBLIC_GETIMGAI_GUIDANCE) : 7.5;
                let seed = process.env.NEXT_PUBLIC_GETIMGAI_SEED ? parseInt(process.env.NEXT_PUBLIC_GETIMGAI_SEED) : 42;
                let scheduler = process.env.NEXT_PUBLIC_GETIMGAI_SCHEDULER || 'dpmsolver++';
                let outputFormat = process.env.NEXT_PUBLIC_GETIMGAI_OUTPUT_FORMAT || 'jpeg';

                // Ensure width and height are multiples of 64
                width = Math.floor(width / 64) * 64;
                height = Math.floor(height / 64) * 64;

                if (width > 1024) {
                  width = 1024;
                }
                if (height > 1024) {
                  height = 1024;
                }
                response = await fetchWithAuth('/api/getimgai', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: model,
                    prompt: `${sentence.trim().replace('\n', ' ').slice(0, 2040)}`,
                    negativePrompt: negativePrompt,
                    width: width,
                    height: height,
                    steps: steps,
                    guidance: guidance,
                    seed: seed,
                    scheduler: scheduler,
                    outputFormat: outputFormat,
                  }),
                });
              }

              if (!response || !response.ok || response.status !== 200) {
                console.error(`ImageGeneration: No response received from Image Generation ${imageSource} API ${response ? response.statusText : ''}`);
                return '';
              }

              const data = await response.json();
              let imageId = uuidv4();
              let duplicateImage = false;
              if (imageSource === 'pexels') {
                return data.photos[0].src.large2x;
              } else if ((imageSource === 'deepai' || imageSource == 'openai') && data.output_url) {
                const imageUrl = data.output_url;
                if (data?.duplicate === true) {
                  duplicateImage = true;
                }
                if (saveImages === 'true' && !duplicateImage && authEnabled) {
                  const idToken = await user?.getIdToken();
                  // Store the image and index it
                  await fetchWithAuth('/api/storeImage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageUrl, prompt: sentence, episodeId: `${localEpisodeId}_${count}`, imageUUID: imageId }),
                  });
                }
                const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET_NAME || '';
                if (bucketName !== '' && !duplicateImage) {
                  return `https://storage.googleapis.com/${bucketName}/deepAIimage/${localEpisodeId}_${count}_${imageId}.jpg`;
                } else {
                  // don't store images in GCS or it is a duplicate image
                  return imageUrl;
                }
              } else if (imageSource === 'getimgai' && data.output_url) {
                const imageUrl = data.output_url;
                if (data?.duplicate === true) {
                  duplicateImage = true;
                }
                return imageUrl;
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

        // This function generates the AI message using GPT
        const generateAImessage = async (imagePrompt: string, personalityPrompt: string, maxTokens: number = 100): Promise<string> => {
          try {
            // Prepare the request body. You may need to adjust this to fit your use case.
            const requestBody = {
              message: imagePrompt,
              prompt: personalityPrompt,
              llm: fastModelName,
              conversationHistory: conversationHistory,  // You may need to populate this with previous conversation history, if any.
              maxTokens: maxTokens,
            };

            let content: string = 'random image of a robot anime AI';
            // Send a POST request to your local API endpoint.
            // timeout if it takes longer than 10 seconds
            // Create an AbortController instance
            const controller = new AbortController();
            const { signal } = controller;

            // Set a timeout to abort the fetch request after N / 1000 seconds
            const timeout = setTimeout(() => {
              controller.abort();
            }, 120000);

            try {
              // Make the fetch request, passing the signal to it
              const response = await fetchWithAuth('/api/gpt', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal  // Pass the abort signal to the fetch request
              });

              if (!response.ok) {
                console.error(`Error: GPT + AI generated message: ${response.statusText}`);
                return imagePrompt;
              }

              // Parse the response
              const data = await response.json();

              // Clear the timeout if the request completes successfully
              clearTimeout(timeout);

              // skip if the response is not 200
              if (response.status !== 200) {
                console.error(`Error: GPT + AI generated message: ${data.error}`);
                return imagePrompt;
              }

              if (debug) {
                console.log(`GPT + AI generated message: ${data.aiMessage.content}`);
              }

              // Extract the AI generated message.
              content = data.aiMessage.content;
              setConvesationHistory([...conversationHistory, data])
            } catch (error) {
              // Handle the error
              console.error(`Error: GPT + AI generated message: ${error}`);
              return imagePrompt;
            }
            return content;
          } catch (error) {
            console.error(`GPT + Failed to generate a message for image, using ${imagePrompt} , error: ${error}`);
            return imagePrompt;
          }
        };

        // This function generates the image using the AI message from the previous function
        const generateAIimage = async (imagePrompt: string, personalityPrompt: string, localLastImage: string, count: number = 0, gptPrompt: boolean = true): Promise<{ image: string, prompt: string }> => {
          try {
            let prompt = imagePrompt;
            let content: string = '';
            let retries = 0;
            while (gptPrompt && content === '') {
              if (retries > 0) {
                console.log(`generateAIimage: Retry #${retries} for image generation`);
                if (retries > 1) {
                  console.log(`generateAIimage: Too many retries for image generation, giving up`);
                  break;
                }
                // sleep for 1 second
                setTimeout(() => {
                  if (debug) {
                    console.log('generateAIimage: sleeping for 1 second, retrying');
                  }
                }, 3000);
              }
              content = await generateAImessage(imagePrompt, personalityPrompt);
            }
            if (content === '') {
              prompt = imagePrompt;
            } else {
              prompt = content;
            }
            // Use the AI generated message as the prompt for generating an image URL.
            let gaibImage = await generateImageUrl(prompt, true, localLastImage, episodeIdRef.current, count);
            return { image: gaibImage, prompt: prompt };
          } catch (error) {
            console.error("Image GPT Prompt + generateImageUrl Failed to generate an image URL:", error);
            return { image: '', prompt: imagePrompt };
          }
        };

        function removeMarkdownAndSpecialSymbols(text: string): string {
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

        async function fetchTranslation(text: string, targetLanguage: string): Promise<string> {
          const idToken = await user?.getIdToken();
          const response = await fetchWithAuth('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, targetLanguage }),
          });

          if (!response.ok) {
            throw new Error('Error in translating text, statusText: ' + response.statusText);
          }

          const data = await response.json();
          return data.translatedText;
        }

        const shareStory = async (storyToShare: Story, automated: boolean): Promise<string> => {
          try {
            if (!user && authEnabled) {
              return '';
            } else if (!user) {
              return '';
            }

            if (debug) {
              console.log('Data being written:', JSON.stringify(storyToShare));
              console.log('ID of the current user:', user.uid);
            }

            // Send a POST request to the API endpoint
            const response = await fetchWithAuth('/api/shareStory', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(storyToShare),
            });

            // Parse the response
            const data = await response.json();

            // Extract the story ID and URL from the response
            const { storyUrl, shareUrl } = data;

            console.log(`Story ${storyToShare.title}... json shared as ${shareUrl} JSON stored as ${storyUrl}.`);
            if (twitchChatEnabled && authEnabled && channelId !== '') {
              // Post the story to the Twitch chat
              await postResponse(channelId,
                `Shared ${storyToShare.isStory ?
                  "Story" : "Question"}: ${storyToShare.title} at ${shareUrl} as personality ${storyToShare.personality} ` +
                `with document embeddings from ${storyToShare.namespace == "groovypdf" ? "Wisdom" : "Science"} ` +
                `Plotline: ${storyToShare.title}`, user.uid);
            }

            return shareUrl;
          } catch (error) {
            console.error('An error occurred in the shareStory function:', error); // Check for any errors
            return '';
          }
        };

        async function processImagesAndSubtitles(story: Story) {
          const imageSource = process.env.NEXT_PUBLIC_IMAGE_SERVICE || 'pexels'; // 'pexels' or 'deepai' or 'openai' or 'getimgai'
          const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET_NAME ? process.env.NEXT_PUBLIC_GCS_BUCKET_NAME : '';
          const message = story.rawText;

          let voiceModels: { [key: string]: string } = {};
          let genderMarkedNames: any[] = [];
          let detectedGender: string = gender;
          let currentSpeaker: string = 'groovy';
          let isContinuingToSpeak = false;
          let isSceneChange = false;
          let lastSpeaker = '';

          let sceneTexts: string[] = [];
          let promptImages: (string)[] = [];
          let promptImageTexts: string[] = [];
          let promptImageText = '';
          let promptImageEpisodeText = '';
          let currentSceneText = "";
          let imageCount = 0;
          let sceneCount = 0;

          // Create a title screen image for the story
          let promptImageTitle =
            "Generate a prompt for generating an image using the following text in context with the previous chat history.\n\n";
          let historyPrimerTitle =
            "Do not reveal you are an AI bot, do the task given to you by the AI, and do not reveal the AI's identity. "
              + "Summarize the given text into concise stable diffusion prompt descriptions for image generation.\n\n";
          let promptImage = promptImageTitle;
          let historyPrimer = historyPrimerTitle;

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

          // get first sentence as title or question to display
          const sentences: string[] = nlp(message).sentences().out('array');
          let firstSentence = sentences.length > 0 ? sentences[0] : query;

          // display title screen with image and title
          const imgGenResult = await generateAIimage(`${promptImageTitle}${message.slice(0, 2040)}`, `${historyPrimerTitle}\n`, '', 0);
          if (imgGenResult.image !== '') {
            lastImage = imgGenResult.image;
            imageCount++;
            promptImages.push(lastImage);
            if (imgGenResult.prompt != '') {
              promptImageEpisodeText = imgGenResult.prompt;
              console.log(`promptImageEpisodeText: ${promptImageEpisodeText}`);
            }
          }
          const titleScreenImage: string = lastImage;
          const titleScreenText: string = firstSentence;

          // Extract the scene texts from the message
          let sentencesToSpeak = [] as string[];

          // add to the beginning of the scentences to speek the query and the title if it is a question
          if (story.isStory) {
            sentencesToSpeak.push(`SCENE: \n\n${story.query}`);
          } else {
            sentencesToSpeak.push(`SCENE: \n\n${story.query}`);
          }
          currentSceneText = story.query + "\n\n";
          sceneCount++;
          sceneTexts.push(currentSceneText);
          currentSceneText = "";

          for (const sentence of sentences) {
            // check if we need to change the scene
            const allowList = ['Title', 'Question', 'Answer', 'Begins', 'Plotline', 'Scene', 'SCENE', 'SCENE:'];

            if (currentSceneText.length > 500
              || allowList.some(word => sentence.includes(word))
              || (!sentence.startsWith('References: ')
                && sentence !== ''
                && (imageSource == 'pexels'
                  || imageCount === 0
                )
              )) {
              // When we encounter a new scene, we push the current scene text to the array
              // and start a new scene text
              let extraPrompt = ''
              let cleanSentence = sentence.replace('SCENE:', '').replace('SCENE', '');
              if (currentSceneText !== "") {
                // generate this scenes image
                console.log(`#SCENE: ${sceneCount + 1} - Generating AI Image #${imageCount + 1}: ${currentSceneText.slice(0, 20)}`);
                setLoadingOSD(`#SCENE: ${sceneCount + 1} - Generating AI Image #${imageCount + 1}: ${currentSceneText.slice(0, 20)}`);

                const imgGenResult = await generateAIimage(`${promptImage} ${currentSceneText}`, `${historyPrimer}\n`, '', imageCount);
                if (imgGenResult.image !== '') {
                  lastImage = imgGenResult.image;
                  imageCount++;
                  promptImages.push(lastImage);
                  if (imgGenResult.prompt != '') {
                    promptImageText = imgGenResult.prompt;
                    promptImageTexts.push(promptImageText);
                    console.log(`promptImageText: ${promptImageText}`);
                    extraPrompt = promptImageText;
                  }
                }

                sceneTexts.push(`${currentSceneText.replace('SCENE:', '').replace('SCENE', '')}`);
                //sceneTexts.push(`${extraPrompt}`);
                // sceneCount++;
                sceneCount++;
              }
              // Next scene setup and increment scene counter
              currentSceneText = cleanSentence;

              sentencesToSpeak.push(`SCENE: ${cleanSentence}`);
              //sentencesToSpeak.push(`SCENE: ${extraPrompt}`);
            } else {
              // If it's not a new scene, we append the sentence to the current scene text
              currentSceneText += ` ${sentence}`;
              sentencesToSpeak.push(sentence);
            }
          }

          // Don't forget to push the last scene text
          if (currentSceneText !== "") {
            sceneTexts.push(`SCENE: ${currentSceneText}`);
            sceneCount++;
          }

          // absence of SCENE markers in the message without any images and no sceneTexts
          let extraPrompt = ''
          if (sceneTexts.length === 0 && imageCount === 0) {
            console.log(`Generating AI Image #${imageCount + 1} for Scene ${sceneCount + 1}: ${currentSceneText.slice(0, 20)}`);
            setLoadingOSD(`Generating #${imageCount + 1} Scene ${sceneCount + 1} of: ${currentSceneText.slice(0, 20)}`);
            const imgGenResult = await generateAIimage(`${promptImage} ${currentSceneText}`, `${historyPrimer}\n`, '', imageCount);
            if (imgGenResult.image !== '') {
              lastImage = imgGenResult.image;
              imageCount++;
              promptImages.push(lastImage);
              if (imgGenResult.prompt != '') {
                promptImageText = imgGenResult.prompt;
                promptImageTexts.push(promptImageText);
                console.log(`promptImageText: ${promptImageText}`);
                extraPrompt = promptImageText;
              }
            }
            sceneTexts.push(`SCENE: ${sentences.join(' ').replace('SCENE:', '').replace('SCENE', '')}`);
            sentencesToSpeak.push(`SCENE: ${sentences.join(' ').replace('SCENE:', '').replace('SCENE', '')}`);
            //sentencesToSpeak.push(`SCENE: ${extraPrompt}`);

            // save story and images for auto save and/or sharing
            sceneCount++;
          } else if (sceneTexts.length === 0) {
            console.log(`No scenes found in the message: ${message}`);
            sceneTexts.push(`SCENE: ${sentences.join(' ').replace('SCENE:', '').replace('SCENE', '')}`);
            sentencesToSpeak.push(`SCENE: ${sentences.join(' ').replace('SCENE:', '').replace('SCENE', '')}`);
            sceneCount++;
          }
          setLoadingOSD(`Generating images for ${sentences.length} sentences with ${sceneTexts.length} scenes...`);

          // keep track of scene and images positions
          let sceneIndex = 0;
          let imagesIndex = 0;
          let title: string = '';
          let summary: string = '';

          // Extract all unique speakers for twitch channel chat responses
          if (channelId !== '' && twitchChatEnabled) {
            const uniqueSpeakers = Array.from(new Set(genderMarkedNames.map(item => item.name)));

            // Create a list of speakers with their genders
            const speakerList = uniqueSpeakers.map(speaker => {
              const speakerGender = genderMarkedNames.find(item => item.name.toLowerCase() === speaker.toLowerCase());
              return `${speaker} (Gender: ${speakerGender?.marker || 'Unknown'})`;
            }).join(', ');

            // Create a title for the story from the first sentence
            title = sentences[0].substring(0, 100);  // Limit the title to 100 characters

            // Create a brief introduction of the story from the second sentence
            const introduction = sentences.length > 1 ? sentences[1].substring(0, 100) : '';  // Limit the introduction to 100 characters

            // Create the summary
            if (story.isStory) {
              summary = `Title: ${title}\n\nStarring ${speakerList}.\n\nScript: ${introduction}...`;
            } else {
              summary = `Question: ${title}\n\nSpeaker(s) ${speakerList}.\n\nAnswer: ${introduction}...`;
            }

            // Post the summary to the API endpoint
            try {
              await postResponse(channelId, summary, user?.uid);
            } catch (error) {
              console.error('Failed to post response: ', error);
            }
          }

          // Display the images and subtitles
          episodeIdRef.current = uuidv4().replace(/-/g, '');

          // Fill the story object
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ? process.env.NEXT_PUBLIC_BASE_URL : '';

          story.title = titleScreenText;
          story.UserId = user?.uid || 'anonymous';
          story.id = episodeIdRef.current;
          story.url = `https://storage.googleapis.com/${bucketName}/stories/${episodeIdRef.current}/data.json`;
          story.imageUrl = titleScreenImage;
          story.imagePrompt = promptImageEpisodeText.replace(/^\"/, '').replace(/\"$/, '');
          story.shareUrl = `${baseUrl}/${episodeIdRef.current}`;

          let scene: Scene | null = null;
          let sentenceId = 0;

          for (let sentence of sentencesToSpeak) {
            // get the image for the sentence
            if (sentence.startsWith('SCENE: ')) {
              sentence = sentence.replace('SCENE: ', '');
              lastImage = promptImages[imagesIndex];
             
              // If there is a previous scene, add it to the story
              if (scene) {
                story.scenes.push(scene);
              }

              // Start a new scene
              scene = {
                id: sceneIndex,
                sentences: [],
                imageUrl: lastImage,
                imagePrompt: promptImageTexts[imagesIndex],
              };

              // Increment the image index
              if (imagesIndex < promptImages.length - 1) {
                imagesIndex++;
              }

              // Increment the scene index
              if (sceneIndex < sceneTexts.length - 1) {
                sceneIndex++;  // Move to the next scene
              }
            }

            let sentences_by_character: string[] = nlp(sentence).sentences().out('array');

            // go through by sentence so we can preserve the speaker
            let spokenLineIndex = 0;
            for (const sentence_by_character of sentences_by_character) {
              if (sentence_by_character == '') {
                continue;
              }

              // Set the subtitle to the translated text if the text is not in English
              let translatedText = '';
              if (subtitleLanguage !== 'en-US' && translateText) {
                translatedText = await fetchTranslation(sentence_by_character, subtitleLanguage);
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

              if (debug) {
                console.log(`Using voice model: ${model} for ${currentSpeaker} - ${detectedGender} in ${audioLanguage} language`);
              }

              // If the speaker has changed or if it's a scene change, switch back to the default voice
              if (!speakerChanged && (sentence_by_character.startsWith('*') || sentence_by_character.startsWith('-'))) {
                detectedGender = gender;
                currentSpeaker = 'groovy';
                model = defaultModel;
                console.log(`Switched back to default voice. Gender: ${detectedGender}, Model: ${model}`);
                isSceneChange = true;  // Reset the scene change flag
              }

              // If the sentence starts with a parenthetical action or emotion, the speaker is continuing to speak
              if (sentence_by_character.startsWith('(') || (!sentence_by_character.startsWith('*') && !speakerChanged && !isSceneChange)) {
                isContinuingToSpeak = true;
              }

              let audioFile: string = '';
              spokenLineIndex += 1;
              const cleanText: string = removeMarkdownAndSpecialSymbols(sentence_by_character);
              let translationEntry: string = '';

              // Speak the sentence if speech output is enabled
              if (audioLanguage === 'en-US') {
                // Speak the original text
                if (debug) {
                  console.log('Speaking as - ', detectedGender, '/', model, '/', audioLanguage, ' - Text: ', cleanText.slice(0, 30));
                }
                try {
                  if (cleanText != '') {
                    audioFile = `audio/${story.id}/${sentenceId}.mp3`;
                    setLoadingOSD(`Speech to Text MP3 encoding #${sentenceId} - ${detectedGender}/${model}/${audioLanguage} - Text: ${cleanText.slice(0, 10)}`);

                    // Try to run speakText to create the audio file
                    try {
                      await speakText(cleanText, 1, detectedGender, audioLanguage, model, audioFile);

                      // Check if the audio file exists
                      const response = await fetch(`https://storage.googleapis.com/${bucketName}/${audioFile}`, { method: 'HEAD' });
                      if (!response.ok) {
                        throw new Error(`File not found at ${audioFile}`);
                      }
                    } catch (e) {
                      console.log('Error speaking text on first attempt or file not found: ', e);

                      // If the first attempt fails or the file doesn't exist, try to run speakText again
                      console.log(`Trying to run speakText again...`);
                      try {
                        await speakText(cleanText, 1, detectedGender, audioLanguage, model, audioFile);

                        // Check if the audio file exists
                        const response = await fetch(`https://storage.googleapis.com/${bucketName}/${audioFile}`, { method: 'HEAD' });
                        if (!response.ok) {
                          throw new Error(`File not found at ${audioFile}`);
                        }
                      } catch (e) {
                        console.log('Error speaking text on second attempt or file not found: ', e);
                        audioFile = '';  // Unset the audioFile variable
                      }
                    }
                  }
                  // sleep for 1 second
                  setTimeout(() => {
                    if (debug) {
                      console.log('avoid any rate limits...');
                    }
                  }, 50);
                } catch (e) {
                  console.log('Error speaking text: ', e);
                }

              } else {
                // Speak the translated text
                if (translatedText !== '' && audioLanguage == subtitleLanguage && translateText) {
                  // Use the previously translated text
                  translationEntry = translatedText;
                } else {
                  // Translate the text
                  translationEntry = await fetchTranslation(sentence_by_character, audioLanguage);
                }
                const cleanTranslation = removeMarkdownAndSpecialSymbols(translationEntry);
                if (debug) {
                  console.log('Speaking as - ', detectedGender, '/', model, '/', audioLanguage, ' - Original Text: ', sentence_by_character, "\n Translation Text: ", cleanTranslation);
                }
                try {
                  if (cleanTranslation != '') {
                    audioFile = `audio/${story.id}/${sentenceId}.mp3`;
                    setLoadingOSD(`Speech to Text MP3 encoding #${sentenceId} - ${detectedGender}/${model}/${audioLanguage} - Text: ${cleanTranslation.slice(0, 10)}`);

                    // Try to run speakText to create the audio file
                    try {
                      await speakText(cleanTranslation, 1, detectedGender, audioLanguage, model, audioFile);

                      // Check if the audio file exists
                      const response = await fetch(`https://storage.googleapis.com/${bucketName}/${audioFile}`, { method: 'HEAD' });
                      if (!response.ok) {
                        throw new Error(`File not found at ${audioFile}`);
                      }
                    } catch (e) {
                      console.log('Error speaking text on first attempt or file not found: ', e);

                      // If the first attempt fails or the file doesn't exist, try to run speakText again
                      console.log(`Trying to run speakText again...`);
                      try {
                        await speakText(cleanTranslation, 1, detectedGender, audioLanguage, model, audioFile);

                        // Check if the audio file exists
                        const response = await fetch(`https://storage.googleapis.com/${bucketName}/${audioFile}`, { method: 'HEAD' });
                        if (!response.ok) {
                          throw new Error(`File not found at ${audioFile}`);
                        }
                      } catch (e) {
                        console.log('Error speaking text on second attempt or file not found: ', e);
                        audioFile = '';  // Unset the audioFile variable
                      }
                    }
                  }
                } catch (e) {
                  console.log('Error speaking text: ', e);
                }
              }

              // Update the last speaker
              lastSpeaker = currentSpeaker;

              // If there is a current scene, add the sentence to it
              if (scene && (cleanText !== '' || translationEntry !== '') && audioFile !== '') {
                scene.sentences.push({
                  id: sentenceId++,
                  text: translationEntry != '' ? translationEntry : sentence_by_character,
                  imageUrl: lastImage,  // or another image related to the sentence
                  speaker: currentSpeaker,  // or another speaker related to the sentence
                  gender: detectedGender,  // or another gender related to the sentence
                  language: audioLanguage,  // or another language related to the sentence
                  model: model,  // or another model related to the sentence
                  audioFile: `https://storage.googleapis.com/${bucketName}/${audioFile}`,  // or another audio file related to the sentence
                });
              }
            }
          }

          // If there is a last scene, add it to the story
          if (scene) {
            story.scenes.push(scene);
          }

          // share the story
          try {
            // Share the story after building it before displaying it
            let shareUrl = await shareStory(story, isFetching);

            if (shareUrl != '' && isDisplayingRef.current === false) {
              setLoadingOSD(`\nEpisode shared to: ${shareUrl}!`);
            }
          } catch (error) {
            console.error(`Error sharing story: ${error}`);
          }

          // Add the story to the playQueue
          setPlayQueue(prevPlayQueue => [...prevPlayQueue, story]);

          // clear the status OSD display
          setLoadingOSD('');
        }

        // Multi Modal theme
        try {
          if (story) {
            processImagesAndSubtitles(story);
          }
        } catch (error) {
          console.error('Error displaying images and subtitles: ', error);
        }
      } catch (error) {
        console.error('SpeakDisplay: UseEffect had an error processing messages: ', error);
      }
      isSpeakingRef.current = false;
    }
  }, [messages, conversationHistory, twitchChatEnabled, speechOutputEnabled, speakText, stopSpeaking, isFullScreen, imageUrl, setSubtitle, setLoadingOSD, gender, audioLanguage, subtitleLanguage, isPaused, isSpeaking, startTime, selectedTheme, isFetching, user, query, isSpeakingRef, playQueue, setPlayQueue, selectedPersonality, selectedNamespace, debug, translateText, subtitleLanguage, isFullScreen, isPaused, isSpeaking, startTime, selectedTheme, isFetching, user, query, isSpeakingRef, playQueue, setPlayQueue, selectedPersonality, selectedNamespace, debug, translateText, subtitleLanguage]);

  // take an Episode and parse the question and return the Episode with the parts filled out from the question
  function parseQuestion(episode: Episode): Episode {
    let localEpisode = episode;
    let localIsStory = localEpisode.type ? localEpisode.type == 'episode' ? true : false : isStory;
    let localNamespace = localEpisode.namespace ? localEpisode.namespace : selectedNamespace;
    let localPersonality = localEpisode.personality ? localEpisode.personality: selectedPersonality;
    let localCommandPrompt = localEpisode.prompt ? localEpisode.prompt : '';

    // fill in the parts of localEpisode with the variables above
    localEpisode.type = localIsStory ? 'episode' : 'question';
    localEpisode.namespace = localNamespace;
    localEpisode.personality = localPersonality;
    localEpisode.prompt = localCommandPrompt;

    // Check if the message is a story and remove the "!type:" prefix
    try {
      if (localEpisode.title.startsWith('!question')) {
        localEpisode.type = 'question';
        localEpisode.title = localEpisode.title.replace('!question:', '').replace('!question', '').trim();
        console.log(`handleSubmit: Extracted question: with !question `);
      } else if (localEpisode.title.startsWith('!episode')) {
        localEpisode.type = 'episode';
        localEpisode.title = localEpisode.title.replace('!episode:', '').replace('!episode', '').trim();
        console.log(`handleSubmit: Extracted episode: with !episode `);
      }
    } catch (error) {
      console.error(`handleSubmit: Error extracting question: '${error}'`);  // Log the question
      if (!twitchChatEnabled) {
        alert(`handleSubmit: Error extracting question: '${error}'`);  // Log the question
      } else if (channelId !== '') {
        postResponse(channelId, `Sorry, I failed a extracting the !episode: or !question:, please try again.`, user?.uid);
      }
    }

    try {
      if (localEpisode.title.toLowerCase().includes('[science]') || localEpisode.title.toLowerCase().includes('[wisdom]')) {
        if (localEpisode.title.toLowerCase().includes('[science]')) {
          localEpisode.namespace = 'videoengineer';
          localEpisode.title = localEpisode.title.toLowerCase().replace('[science]', '').trim();
        } else if (localEpisode.title.toLowerCase().includes('wisdom')) {
          localEpisode.namespace = 'groovypdf';
          localEpisode.title = localEpisode.title.toLowerCase().replace('[wisdom]', '').trim();
        }
        console.log(`handleSubmit: Extracting namespace from question: as ${localEpisode.namespace}`);  // Log the question
      }
    } catch (error) {
      console.error(`handleSubmit: Error extracting namespace: '${error}'`);  // Log the question
      if (!twitchChatEnabled) {
        alert(`handleSubmit: Error extracting namespace: '${error}'`);  // Log the question
      } else if (channelId !== '') {
        postResponse(channelId, `Sorry, I failed a extracting the namespace, please try again.`, user?.uid);
      }
    }

    // Extract the personality from the question
    try {
      if (localEpisode.title.toLowerCase().includes('[personality]')) {
        let personalityMatch = localEpisode.title.toLowerCase().match(/\[personality\]\s*([\w\s]*?)(?=\s|$)/i);
        if (personalityMatch) {
          let extractedPersonality = personalityMatch[1].toLowerCase().trim() as keyof typeof PERSONALITY_PROMPTS;
          if (!PERSONALITY_PROMPTS.hasOwnProperty(extractedPersonality)) {
            console.error(`buildPrompt: Personality "${extractedPersonality}" does not exist in PERSONALITY_PROMPTS object.`);
            localEpisode.personality = 'groovy' as keyof typeof PERSONALITY_PROMPTS;
            if (twitchChatEnabled && channelId !== '') {
              postResponse(channelId, `Sorry, personality "${extractedPersonality}" does not exist in my database.`, user?.uid);
            }
          }
          localEpisode.personality = extractedPersonality;
          console.log(`handleSubmit: Extracted personality: "${localEpisode.personality}"`);  // Log the extracted personality
          localEpisode.title = localEpisode.title.toLowerCase().replace(new RegExp('\\[personality\\]\\s*' + extractedPersonality, 'i'), '').trim();
          localEpisode.title = localEpisode.title.toLowerCase().replace(new RegExp('\\[personality\\]', 'i'), '').trim();
          console.log(`handleSubmit: Updated question: '${localEpisode.title}'`);  // Log the updated question
        } else {
          console.log(`handleSubmit: No personality found in question: '${localEpisode.title}'`);  // Log the question
          if (twitchChatEnabled && channelId !== '') {
            postResponse(channelId, `Sorry, I failed a extracting the personality, please try again. Question: ${localEpisode.title}`, user?.uid);
          }
        }
      }
    } catch (error) {
      console.error(`handleSubmit: Error extracting personality: '${error}'`);  // Log the question
      if (!twitchChatEnabled) {
        alert(`handleSubmit: Error extracting personality: '${error}'`);  // Log the question
      } else if (channelId !== '') {
        postResponse(channelId, `Sorry, I failed a extracting the personality, please try again.`, user?.uid);
      }
    }

    // Extract a customPrompt if [PROMPT] "<custom prompt>" is given with prompt in quotes, similar to personality extraction yet will have spaces
    try {
      if (localEpisode.title.toLowerCase().includes('[prompt]')) {
        let endPrompt = false;
        let customPromptMatch = localEpisode.title.toLowerCase().match(/\[prompt\]\s*\"([^"]*?)(?=\")/i);
        if (customPromptMatch) {
          // try with quotes around the prompt
          localEpisode.prompt = customPromptMatch[1].trim();
        } else {
          // try without quotes around the prompt, go from [PROMPT] to the end of line or newline character
          customPromptMatch = localEpisode.title.toLowerCase().match(/\[prompt\]\s*([^"\n]*?)(?=$|\n)/i);
          if (customPromptMatch) {
            localEpisode.prompt = customPromptMatch[1].trim();
            endPrompt = true;
          }
        }
        if (localEpisode.prompt) {
          console.log(`handleSubmit: Extracted commandPrompt: '${localEpisode.prompt}'`);  // Log the extracted customPrompt
          // remove prompt from from question with [PROMPT] "<question>" removed
          if (endPrompt) {
            localEpisode.title = localEpisode.title.toLowerCase().replace(new RegExp('\\[prompt\\]\\s*' + localEpisode.prompt, 'i'), '').trim();
          } else {
            localEpisode.title = localEpisode.title.toLowerCase().replace(new RegExp('\\[prompt\\]\\s*\"' + localEpisode.prompt + '\"', 'i'), '').trim();
          }
          console.log(`handleSubmit: Command Prompt removed from question: '${localEpisode.title}' as ${localEpisode.prompt}`);  // Log the updated question
        } else {
          console.log(`handleSubmit: No Command Prompt found in question: '${localEpisode.title}'`);  // Log the question
        }
      }
    } catch (error) {
      console.error(`handleSubmit: Error extracting command Prompt: '${error}'`);  // Log the question
      if (!twitchChatEnabled) {
        alert(`handleSubmit: Error extracting command Prompt: '${error}'`);  // Log the question
      } else if (channelId !== '') {
        postResponse(channelId, `Sorry, I failed a extracting the command Prompt, please try again.`, user?.uid);
      }
    }

    if (localEpisode.title.toLowerCase().includes('[refresh]')) {
      try {
        localEpisode.refresh = true;  // Set the refresh flag
        localEpisode.title = localEpisode.title.toLowerCase().replace('[refresh]', '').trim();
        console.log(`handleSubmit: [REFRESH] Cleared history and Updated question: '${localEpisode.title}'}`);
      } catch (error) {
        console.error(`handleSubmit: Error clearing history: '${error}'`);  // Log the question
        if (!twitchChatEnabled) {
          alert(`handleSubmit: Error clearing history: '${error}'`);  // Log the question
        } else if (channelId !== '') {
          postResponse(channelId, `Sorry, I failed clearing the history, please try again.`, user?.uid);
        }
      }
    }

    // confirm all fields are filled out
    if (localEpisode.title == '') {
      console.error(`handleSubmit: Error extracting question: '${localEpisode.title}'`);  // Log the question
    }
    if (localEpisode.namespace == '') {
      localEpisode.namespace = selectedNamespace;
    }
    if (localEpisode.personality == '') {
      localEpisode.personality = selectedPersonality;
    }
    if (localEpisode.prompt == '') {
      localEpisode.prompt = localCommandPrompt;
    }

    return localEpisode;
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault(); // Prevent the default action
  };

  const handleEnter = (e: any) => {
    if (e.key === 'Enter' && !e.shiftKey && query.trim() != '') {
      e.preventDefault(); // Prevent the default action

      let episode: Episode = {
        title: query,
        type: isStory ? 'episode' : 'question',
        username: 'anonymous',
        namespace: selectedNamespace,
        personality: selectedPersonality,
        refresh: false,
        prompt: '',
        sourceDocs: [],
        documentCount: documentCount,
        episodeCount: episodeCount,
        gptModel: modelName,
        gptFastModel: fastModelName,
        gptPrompt: buildPrompt(selectedPersonality as keyof typeof PERSONALITY_PROMPTS, isStory),
        defaultGender: gender,
        speakingLanguage: audioLanguage,
        subtitleLanguage: subtitleLanguage,
      }
      episode = parseQuestion(episode); // parse the question
      setEpisodes([...episodes, episode]);
      setQuery('');
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

  const latestMessage = useMemo(() => {
    return (chatMessages.length > 0) ? chatMessages[chatMessages.length - 1] :
      { type: 'apiMessage', message: '', sourceDocs: undefined };
  }, [chatMessages]);

  useEffect(() => {
    if (messageListRef.current) {
      // Scroll the container to the bottom
      messageListRef.current.scrollTo(0, messageListRef.current.scrollHeight);
    }
  }, [chatMessages, latestMessage]);

  // Update the startSpeechRecognition function
  const startSpeechRecognition = useCallback(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      // Update the listening state
      if (listening) {
        if (stoppedManually && recognition) {
          recognition.stop();
          setListening(false);
          setVoiceQuery('');
          console.log(`startSpeechRecognition: Stopping speech recognition, stoppedManually: ${stoppedManually}`)
        } else {
          console.log(`startSpeechRecognition: Speech recognition already started, stoppedManually: ${stoppedManually}`);
        }
        return;
      } else if (!listening && !stoppedManually) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.continuous = true;
        recognition.timeout = 900000;

        timeoutDetected.current = false;
        setListening(true);
        setVoiceQuery('');
        recognition.start();
        console.log(`startSpeechRecognition: Starting speech recognition, stoppedManually: ${stoppedManually}`)
      }

      if (stoppedManually) {
        return;
      }

      // Update the onstart function
      recognition.onstart = () => {
        setListening(true);
        setVoiceQuery('');
        setSpeechRecognitionComplete(false);
      };

      // Update the onend function
      recognition.onend = () => {
        setListening(false);
        setSpeechRecognitionComplete(true);
      };

      // Declare a variable to hold the entire spoken input
      let spokenInput = '';

      // onresult function to handle the speech recognition results
      recognition.onresult = (event: { results: string | any[]; }) => {
        let last = event.results.length - 1;
        let text = event.results[last][0].transcript;
        let isFinal = event.results[last].isFinal;

        // Only process the result if it is final
        if (isFinal) {
          // Use the NLP library to split the new text into sentences
          let sentences = nlp(text).sentences().out('array');

          // Iterate over the sentences
          for (let sentence of sentences) {
            // Tokenize the sentence and the last few words of the spoken input
            let sentenceWords = nlp(sentence).out('array');
            let spokenWords = nlp(spokenInput).out('array').slice(-sentenceWords.length);

            // Compare the sentence with the last few words of the spoken input
            let isSimilar = sentenceWords.every((word: any, index: any) => word === spokenWords[index]);

            // If the sentence is not similar to the last few words of the spoken input, add it to the spoken input
            if (!isSimilar) {
              spokenInput += ' ' + sentence;
            }
          }

          // If the transcript includes the word "hey groovy", set the start word detected ref to true
          if (spokenInput.toLowerCase().includes("hey groovy") || spokenInput.toLowerCase().includes("hey groovy")) {
            // trim off the text prefixing "hey gabe" or "hey groovy" in the spokenInput
            spokenInput = spokenInput.toLowerCase().replace(/.*?(hey groovy|hey groovy)/gi, '').trim();
            startWordDetected.current = true;
          } else if (!startWordDetected.current) {
            console.log(`Speech recognition onresult: Start word not detected, spokenInput: '${spokenInput.slice(0, 16)}...'`);
            setVoiceQuery('');
            spokenInput = '';
          }

          // If the transcript includes the word "stop groovy", stop the recognition
          if (spokenInput.toLowerCase().includes("stop groovy") || spokenInput.toLowerCase().includes("stop groovy")) {
            stopWordDetected.current = true;
            recognition.stop();
            setVoiceQuery('');
            spokenInput = '';
          } else {
            stopWordDetected.current = false;
          }

          // Only set the query to the spoken input if the start word has been detected
          if (startWordDetected.current && !stopWordDetected.current) {
            console.log(`Speech recognition onresult: Setting voiceQuery, spokenInput: '${spokenInput.slice(0, 16)}...'`);
            setVoiceQuery(spokenInput.trim());
          }
        }

        // Set a new timeout to stop the recognition after 10 seconds of no speaking
        const newTimeoutID = setTimeout(() => {
          recognition.stop();
          if (!stopWordDetected.current && !isSpeaking && startWordDetected.current) {
            console.log(`Speech recognition timed out with voiceQuery results, voiceQuery: '${voiceQuery.slice(0, 16)}...'`);
            setSpeechRecognitionComplete(true);
            timeoutDetected.current = true;
          } else {
            console.log(`Speech recognition timed out after 10 seconds without voiceQuery results, voiceQuery: '${voiceQuery.slice(0, 16)}...'`);
            spokenInput = '';
          }
        }, 10000); // Timeout after finished speaking
        setTimeoutID(newTimeoutID);
      };

      recognition.onerror = (event: { error: any; }) => {
        console.error('Error occurred in recognition:', event.error);
        if (event.error === 'no-speech') {
          console.log('No speech was detected. Try again.');
        } else if (event.error === 'aborted') {
          console.log('Speech recognition aborted.');
        } else if (event.error === 'network') {
          console.log('Network error occurred.');
        } else if (!stoppedManually && !isSpeaking && !timeoutDetected.current) {
          startSpeechRecognition();
        } else {
          console.error(`recognition.onerror: Error occurred in recognition: ${event.error}, stoppedManually: ${stoppedManually}, isSpeaking: ${isSpeaking}, timeoutDetected: ${timeoutDetected.current}`);
        }
      };
    } else {
      console.log('Speech Recognition API is not supported in this browser.');
    }
  }, [listening, stoppedManually, recognition, setListening, setVoiceQuery, setSpeechRecognitionComplete, timeoutDetected, startWordDetected, stopWordDetected, setTimeoutID, isSpeaking, voiceQuery]);

  // Add a useEffect hook to call handleSubmit whenever the query state changes
  useEffect(() => {
    if (voiceQuery && speechRecognitionComplete && timeoutDetected.current && !stopWordDetected.current && !isSpeaking) {
      console.log(`useEffect: Queing voiceQuery: '${voiceQuery.slice(0, 80)}...'`);
      let episode: Episode = {
        title: voiceQuery,
        type: isStory ? 'episode' : 'question',
        username: 'voice',
        namespace: selectedNamespace,
        personality: selectedPersonality,
        refresh: false,
        prompt: '',
        sourceDocs: [],
        documentCount: documentCount,
        episodeCount: episodeCount,
        gptModel: modelName,
        gptFastModel: fastModelName,
        gptPrompt: buildPrompt(selectedPersonality as keyof typeof PERSONALITY_PROMPTS, isStory),
        defaultGender: gender,
        speakingLanguage: audioLanguage,
        subtitleLanguage: subtitleLanguage,
      }
      if (debug) {
        console.log(`Queing episode: ${JSON.stringify(episode, null, 2)}`);
      }
      setEpisodes([...episodes, episode]);
      setVoiceQuery('');
      timeoutDetected.current = false;
      startWordDetected.current = false;
      stopWordDetected.current = false;
      if (!stoppedManually) {
        console.log(`useEffect: Starting speech recognition after Queing voiceQuery: '${voiceQuery.slice(0, 80)}...'`);
        startSpeechRecognition();
      }
    }
  }, [voiceQuery, speechRecognitionComplete, isSpeaking, stoppedManually, isStory, episodes, startSpeechRecognition, selectedNamespace, selectedPersonality]);

  // Add a useEffect hook to start the speech recognition when the component mounts
  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      if (!listening && !isSpeaking && !stoppedManually && !voiceQuery) {
        console.log(`useEffect: Starting speech recognition, stoppedManually: ${stoppedManually}`);
        startSpeechRecognition();
      }
    }
  }, [listening, isSpeaking, voiceQuery, stoppedManually, startSpeechRecognition]);

  // speech toggle
  const handleSpeechToggle = () => {
    if (!stoppedManually) {
      setStoppedManually(true);
      setListening(false);
      setVoiceQuery('');
      timeoutDetected.current = true;
      if (recognition) {
        recognition.stop();
      }
    } else {
      setStoppedManually(false);
      timeoutDetected.current = false;
      setVoiceQuery('');
      startSpeechRecognition();
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
        messages: [],
      };
    });
    alert(`Chat history cleared.`);
  };

  // replay episode from history using passthrough REPLAY: <story> submit mock handlesubmit
  const handleReplay = () => {
    let episode: Episode = {
      title: `REPLAY: ${latestMessage.message}`,
      type: isStory ? 'episode' : 'question',
      username: 'voice',
      namespace: '',
      personality: "passthrough",
      refresh: false,
      prompt: '',
      sourceDocs: [],
      documentCount: documentCount,
      episodeCount: episodeCount,
      gptModel: modelName,
      gptFastModel: fastModelName,
      gptPrompt: buildPrompt(selectedPersonality as keyof typeof PERSONALITY_PROMPTS, isStory),
      defaultGender: gender,
      speakingLanguage: audioLanguage,
      subtitleLanguage: subtitleLanguage,
    }
    if (debug) {
      console.log(`Replay is queing episode: ${JSON.stringify(episode, null, 2)}`);
    }
    episode = parseQuestion(episode); // parse the question
    setEpisodes([...episodes, episode]);
  };

  // stop speaking
  const handleStop = () => {
    stopSpeaking();
    setIsPaused(false);
    setIsSpeaking(false);
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

  const handleModelNameChange = (newModelName: string) => {
    setModelName(newModelName);
    // You can add any additional logic you need when the model name changes
  };

  const handleFastModelNameChange = (newFastModelName: string) => {
    setFastModelName(newFastModelName);
    // You can add any additional logic you need when the fast model name changes
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
        <title>Groovy</title>
      </div>
      <Layout>
        <div className="mx-auto flex flex-col gap-4 bg-#FFCC33">
          <main className={styles.main}>

            <div className={styles.cloud}>
              <div ref={messageListRef}
                className={styles.imageContainer}
                style={{
                  position: isFullScreen ? "fixed" : "relative",
                  top: isFullScreen ? 0 : "auto",
                  left: isFullScreen ? 0 : "auto",
                  width: isFullScreen ? "auto" : "auto",
                  height: isFullScreen ? "100vh" : "100%",
                  zIndex: isFullScreen ? 1000 : "auto",
                  backgroundColor: isFullScreen ? "black" : "transparent",
                }}
              >
                <button
                  type="button"
                  className={styles.fullscreenButton}
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                  }}
                  onClick={toggleFullScreen}
                >
                  {isFullScreen ? "Exit Full Screen" : "Full Screen"}
                </button>
                {selectedTheme === 'MultiModal' ? (
                  <div className={styles.generatedImage}>
                    <div className={
                      isFullScreen ? styles.fullScreenOSD : styles.osd
                    }>
                      {(!isDisplayingRef.current) && playQueue.length > 0 ? (
                        <>
                          <div className={styles.generatedImage}>
                            <table className={`${styles.episodeScreenTable} ${styles.episodeList}`}>
                              <thead>
                                <tr>
                                  <th colSpan={2}>
                                    <p className={`${styles.header} ${styles.episodeList} ${styles.center}`}>-*- Programming Schedule -*-</p>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...playQueue].reverse().map((episode, index) => (
                                  <tr key={index}>
                                    <td>
                                      <p className={`${styles.footer} ${styles.episodeList}`}>* Episode {playQueue.length - index}: &quot;{episode.query}&quot;</p>                                    
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (<></>)}
                    </div>
                    <button
                      className={styles.loadingOSDButton}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                      }}
                      type="button"
                    >
                      {loadingOSD}{(latestMessage.message) ? latestMessage.message.replace(/\n/g, '').split('').reverse().slice(0, 45).reverse().join('') : isSpeaking ? 'Playing...' : ' - Groovy is ready to generate your vision!'}
                    </button>
                    {(imageUrl === '') ? "" : (
                      <>
                        <img
                          src={imageUrl}
                          alt="Groovy"
                        />
                      </>
                    )}
                    <div className={
                      isDisplayingRef.current ? `${isFullScreen ? styles.fullScreenSubtitle : styles.subtitle} ${styles.left}` : isFullScreen ? styles.fullScreenSubtitle : styles.subtitle
                    }>
                      {subtitle}
                    </div>
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
                      onClick={handleSpeechToggle}
                      type="button"

                    >
                      {!stoppedManually ? 'Voice Input Off' : 'Voice Input On'}
                    </button>&nbsp;&nbsp;&nbsp;&nbsp;
                    {isSpeaking ? (
                      <>
                        <button
                          title="Stop Speaking"
                          onClick={handleStop}
                          type="button"
                          disabled={!isSpeaking}
                          className={`${styles.footer} ${isSpeaking ? styles.listening : ''}`}
                        >Stop Speaking</button> &nbsp;&nbsp;&nbsp;&nbsp;
                      </>
                    ) : (
                      <>
                        <button
                          title="Replay"
                          onClick={handleReplay}
                          type="button"
                          className={`${styles.footer}`}
                        >Replay</button> &nbsp;&nbsp;&nbsp;&nbsp;</>
                    )}
                    <button
                      title="Clear History"
                      onClick={handleClear}
                      type="button"
                      disabled={isSpeaking}
                      className={styles.footer}
                    >Clear Chat History</button>&nbsp;&nbsp;&nbsp;&nbsp;
                    <button
                      title="Copy Story"
                      onClick={copyStory}
                      type="button"
                      className={styles.footer}
                    >Copy Story</button>
                    {authEnabled ? (
                      <>
                        &nbsp;&nbsp;&nbsp;&nbsp;
                        <button
                          title="Share Story"
                          onClick={handleShareStory}
                          type="button"
                          className={styles.footer}
                        >Share Story</button>&nbsp;&nbsp;&nbsp;&nbsp;
                        <>
                          <a className={styles.footer} href='/feed' target="_blank" rel="noopener noreferrer">Story Board</a>
                        </>
                      </>
                    ) : (
                      <></>
                    )}
                  </div>
                  {/* Drop down menu configuration row 1 and 2 */}
                  <div className={styles.cloudform}>
                    <div className={styles.cloudform}>
                      <select
                        className={styles.dropdown}
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
                      <select
                        id="gender-select"
                        className={styles.dropdown}
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
                    <div className={styles.cloudform}>
                      <ModelNameDropdown onChange={handleModelNameChange} />
                      &nbsp;&nbsp;
                      <FastModelNameDropdown onChange={handleFastModelNameChange} />
                    </div>
                  </div>
                  {/* Question/Topic text entry box */}
                  <div className={styles.cloudform}>
                    <textarea
                      onKeyDown={handleEnter}
                      ref={textAreaRef}
                      autoFocus={true}
                      rows={3}
                      maxLength={1000000}
                      id="userInput"
                      name="userInput"
                      placeholder={
                        (selectedPersonality == 'passthrough') ? 'Passthrough mode, replaying your input...' :
                          isDisplayingRef.current
                            ? isStory
                              ? `Writing your story...`
                              : `Answering your question...`
                            : isStory
                              ? `[${selectedPersonality}/${selectedNamespace} ${gender} ${audioLanguage}/${subtitleLanguage} (${documentCount} docs) X ${episodeCount} episodes]\nSay "Hey Groovy...Plotline" for a story, say "Stop Groovy" to cancel. You can also type it here then press the Enter key.`
                              : `[${selectedPersonality}/${selectedNamespace} ${gender} ${audioLanguage}/${subtitleLanguage} (${documentCount} docs) X ${episodeCount} answers]\nSay "Hey Groovy...Question" for an answer, say "Stop Groovy" to cancel. You can also type it here then press the Enter key.`
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
                      readOnly={isDisplayingRef.current || (selectedPersonality == 'passthrough')}
                      ref={textAreaPersonalityRef}
                      id="customPrompt"
                      name="customPrompt"
                      maxLength={2000}
                      rows={2}
                      placeholder={
                        (selectedPersonality == 'passthrough') ? 'Passthrough mode, personality is disabled.' :
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
                        readOnly={isDisplayingRef.current || (selectedPersonality == 'passthrough')}
                        ref={textAreaCondenseRef}
                        id="condensePrompt"
                        name="condensePrompt"
                        maxLength={800}
                        rows={2}
                        placeholder={
                          (selectedPersonality == 'passthrough') ? 'Passthrough mode, question/title generation is disabled.' :
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
                  <div className={styles.cloudform}>
                    <button
                      title="Toggle News Feed"
                      className={`${styles.footer} ${(feedNewsChannel) ? styles.listening : ''}`}
                      onClick={() => setFeedNewsChannel(feedNewsChannel ? false : true)}>
                      {feedNewsChannel ? 'Fetching News' : 'Fetch News'}
                    </button>
                    &nbsp;&nbsp;&nbsp;&nbsp;
                    <button
                      title="Toggle Twitch Chat"
                      className={`${styles.footer} ${(twitchChatEnabled) ? styles.listening : ''}`}
                      onClick={() => setTwitchChatEnabled(!twitchChatEnabled)}>
                      {twitchChatEnabled ? 'Twitch OFF' : 'Twitch ON'}
                    </button>
                    &nbsp;&nbsp;&nbsp;&nbsp;
                    <button
                      title="Automate the Fetching of News and Playing of Twitch Chat"
                      onClick={handleFetchButtonClick}
                      className={`${styles.footer} ${isFetching ? styles.listening : ''}`}
                      type="button"
                    >
                      {isFetching ? `Automation Stop` : `Automation Start`}
                    </button>
                    <Modal
                      isOpen={modalIsOpen}
                      onRequestClose={handleModalClose}
                      shouldCloseOnOverlayClick={false} // Prevents the modal from closing when clicking outside of it
                      style={feedModalStyle}
                      contentLabel="News Feed Settings"
                    >
                      {feedNewsChannel ? (
                        <>
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
                        </>
                      ) : (
                        <></>
                      )}
                      <h2 style={{ fontWeight: 'bold' }}>Start Automation (Twitch/News/Programming)</h2>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                        <button className={styles.footer} onClick={handleModalClose}>Start Automation</button>
                        <button className={styles.footer} onClick={() => setModalIsOpen(false)}>Cancel</button>
                      </div>
                    </Modal>
                    &nbsp;&nbsp;&nbsp;&nbsp;
                    <EpisodePlanner episodes={episodes} onNewEpisode={handleNewEpisode} onEpisodeChange={handleEpisodeChange} />
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
