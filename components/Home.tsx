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
  const [subtitle, setSubtitle] = useState<string>('\n- Groovy -\nCreate your own story today');
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
    const intervalId = setInterval(processTwitchChat, 1000);  // Then every N seconds

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

    const intervalId = setInterval(processNewsArticle, 10000);  // Then every N seconds

    return () => clearInterval(intervalId);  // Clear interval on unmount
  }, [isFetching, currentNewsIndex, news, setCurrentNewsIndex, feedPrompt, episodes, isStory, feedNewsChannel, newsFeedEnabled, isProcessingRef, currentOffset, feedCategory, feedKeywords, feedSort, maxQueueSize, selectedNamespace, selectedPersonality, parseQuestion]);

  // handle the submitQueue of episodes
  useEffect(() => {
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
          let sceneCount = 0;

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

          // Display the images and subtitles
          episodeIdRef.current = uuidv4().replace(/-/g, '');

          // Fill the story object
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ? process.env.NEXT_PUBLIC_BASE_URL : '';
          const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET_NAME || '';

          story.id = episodeIdRef.current;
          story.url = `https://storage.googleapis.com/${bucketName}/stories/${episodeIdRef.current}/data.json`;
          story.shareUrl = `${baseUrl}/${episodeIdRef.current}`;

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
                    },
                    body: JSON.stringify({
                      episodeId: episodeIdRef.current,
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
                      gender: story.defaultGender,
                      speakingLanguage: story.speakingLanguage,
                      subtitleLanguage: story.subtitleLanguage,
                    }),
                    signal: ctrl.signal,
                    onmessage: (event: { data: string; }) => {
                      //console.log(`handleSubmit: event is ${JSON.stringify(event)}`);
                      if (event.data === '[DONE]' || event.data === '[ERROR]') {
                        // fill in the story and add it to the story queue
                        story.rawText = pendingMessage;
                        story.tokens = tokens;
                        story.references = pendingSourceDocs;
                        const storyPart: Story = {
                          ...story,
                        }
                        storyPart.scenes = [];
                        setPlayQueue([...playQueue, storyPart]);
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
                          if (data.scene) {
                            console.log(`handleSubmit: Recieved scene #${sceneCount} ${JSON.stringify(data.scene)}}`);
                            story.scenes.push(data.scene);
                            if (sceneCount === 0) {
                              story.title = data.scene.sentences[0].text;
                              story.imageUrl = data.scene.sentences[0].imageUrl;
                            }
                            const storyPart: Story = {
                              ...story,
                            }
                            storyPart.scenes = [data.scene];
                            setPlayQueue([...playQueue, storyPart]);
                            sceneCount++;
                          } else if(data.sourceDocs) {
                            console.log(`handleSubmit: Recieved ${data.sourceDocs.length} sourceDocs ${JSON.stringify(data.sourceDocs)}}`);
                            pendingSourceDocs = data.sourceDocs;
                          } else if (data.data) {
                            pendingMessage += data.data;
                          } else {
                            console.log(`handleSubmit: Recieved uknown data ${JSON.stringify(data)}}`);
                          }
                        } catch (error) {
                          console.error('An error occurred in the handleSubmitQueue function:', error); // Check for any errors
                        }

                        // Update the OSD and token count
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

          // share the story
          shareStory(story, isFetching);
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

        // Check if the story has any scenes
        if (playStory.scenes && playStory.scenes.length === 0) {
          console.error(`PlayQueaue: Story #${playQueue.length} has no scenes, skipping.`);
          setPlayQueue(playQueue.slice(1));  // Remove the story from the queue
          return;
        }

        try {
          console.log(`PlayQueaue: Displaying Recieved Story #${playQueue.length}: ${playStory.title}\n${JSON.stringify(playStory)}\n`);

          isDisplayingRef.current = true;
          setIsSpeaking(true);

          if (playStory.scenes.length > 0 && playStory.scenes[0].id === 0) {
            setSubtitle(`Title: ${playStory.title}`); // Clear the subtitle
            setLoadingOSD(`Prompt: ${playStory.prompt}\nShared to: ${playStory.shareUrl}\n${playStory.tokens} Tokens ${playStory.isStory ? 'Story' : 'Question'} ${playStory.personality} ${playStory.namespace}\n${playStory.references && playStory.references.join(', ')}`);
            setLastStory(playStory.shareUrl);
            setImageUrl(playStory.imageUrl);
          }

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

        // end of story reset the subtitle and OSD
        if (playStory.tokens > 0) {
          setSubtitle('Think of a story you want to tell, or a question you want to ask.');

          setLoadingOSD(`Finished playing ${playStory.title}. `);
          setSubtitle('\nGroovy\nCreate your visions and dreams today');
        }
      }
    };

    playQueueDisplay();  // Run immediately on mount

    // check if there are any episodes left, if so we don't need to sleep
    const intervalId = setInterval(playQueueDisplay, 1000);  // Then every N seconds

    return () => clearInterval(intervalId);  // Clear interval on unmount
  }, [playQueue, isSpeaking, isDisplayingRef, stopSpeaking, speakAudioUrl, setSubtitle, setIsSpeaking, setLoadingOSD, setImageUrl, setLastStory]);

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
