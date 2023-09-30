import { useRef, useState, useEffect, useMemo, useCallback, createContext, useContext } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/Home.module.css';
import { Message } from '@/types/chat';
import { Story, Episode, Scene } from '@/types/story';
import { Document } from 'langchain/document';
import { useSpeakText } from '@/utils/speakText';
import {
  PERSONALITY_PROMPTS,
  PERSONALITY_IMAGES,
  PERSONALITY_MOUTHS,
  PERSONALITY_VOICE_MODELS,
  speakerConfigs,
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
import { SpeakerConfig } from '@/types/speakerConfig';
import * as PIXI from 'pixi.js';
import { TextStyle, Text, Sprite } from 'pixi.js';
import { app } from 'firebase-admin';
import build from 'next/dist/build';

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
  const { speakText, stopSpeaking, pauseSpeaking, resumeSpeaking, speakAudioUrl } = useSpeakText();

  const [listening, setListening] = useState<boolean>(false);
  const [stoppedManually, setStoppedManually] = useState<boolean>(true);
  const [speechRecognitionComplete, setSpeechRecognitionComplete] = useState(false);
  const [speechOutputEnabled, setSpeechOutputEnabled] = useState(true);
  const [timeoutID, setTimeoutID] = useState<NodeJS.Timeout | null>(null);

  const messageListRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const textAreaCondenseRef = useRef<HTMLTextAreaElement>(null);
  const textAreaPersonalityRef = useRef<HTMLTextAreaElement>(null);
  const [subtitle, setSubtitle] = useState<string>(`Groovy is Loading...`);
  const [loadingOSD, setLoadingOSD] = useState<string>('Welcome to Groovy the AI Bot.');
  const defaultGaib = process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE || '';
  const [imageUrl, setImageUrl] = useState<string>(defaultGaib);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [gender, setGender] = useState('FEMALE');
  const [selectedPersonality, setSelectedPersonality] = useState<keyof typeof PERSONALITY_PROMPTS>('buddha');
  const [selectedNamespace, setSelectedNamespace] = useState<string>('groovypdf');
  const [audioLanguage, setAudioLanguage] = useState<string>("en-US");
  const [subtitleLanguage, setSubtitleLanguage] = useState<string>("en-US");
  const [isPaused, setIsPaused] = useState(false);
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [tokensCount, setTokensCount] = useState<number>(800);
  const [isStory, setIsStory] = useState<boolean>(false);
  const [selectedTheme, setSelectedTheme] = useState<string>('MultiModal');
  const [documentCount, setDocumentCount] = useState<number>(1);
  const [episodeCount, setEpisodeCount] = useState<number>(1);
  const [news, setNews] = useState<Array<any>>([]);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [currentNewsIndex, setCurrentNewsIndex] = useState<number>(0);
  const isProcessingNewsRef = useRef<boolean>(false);
  const isProcessingTwitchRef = useRef<boolean>(false);
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
  const [storyQueue, setStoryQueue] = useState<Story[]>([]);
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
  const [modelName, setModelName] = useState<string>(process.env.MODEL_NAME || 'gpt-4');
  const [fastModelName, setFastModelName] = useState<string>(process.env.QUESTION_MODEL_NAME || 'gpt-3.5-turbo-16k');
  const [currentNumber, setCurrentNumber] = useState<number>(1);
  const [personalityImageUrls, setPersonalityImageUrls] = useState<Record<string, string>>({});
  const imageSource = process.env.NEXT_PUBLIC_IMAGE_SERVICE || 'pexels'; // 'pexels' or 'deepai' or 'openai' or 'getimgai'
  const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET_NAME ? process.env.NEXT_PUBLIC_GCS_BUCKET_NAME : '';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ? process.env.NEXT_PUBLIC_BASE_URL : '';
  const lastStatusMessage = useRef<string>('');
  const [currentStory, setCurrentStory] = useState<Story | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const faceContainerRef = useRef<HTMLDivElement | null>(null);
  const loaderRef = useRef<PIXI.Loader | null>(null);
  const subtitleTextRef = useRef<PIXI.Text | null>(null);
  const statusBarTextRef = useRef<PIXI.Text | null>(null);
  const episodeOverlayTextRef = useRef<PIXI.Text | null>(null);
  const backgroundOverlayTextRef = useRef<PIXI.Graphics | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null); // Ref to store the video element
  const spriteRef = useRef<PIXI.Sprite | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const videoReadyRef = useRef(false);
  let videoReadyToPlay = false; // Declare a flag for video readiness
  const appRef = useRef<PIXI.Application | null>(null);
  const audioRef = useRef(new Audio());
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [currentUrl, setCurrentUrl] = useState('');
  const [useContextRetrieval, setUseContextRetrieval] = useState<boolean>(false);

  const loader: PIXI.Loader = PIXI.Loader.shared;
  loaderRef.current = loader;
  loaderRef.current.onError.add((error) => console.error('Error loading resources:', error));

  const addToQueue = (story: Story) => {
    setPlayQueue(prevQueue => [...prevQueue, story]);
  };

  const removeFromQueue = (): Story | null => {
    if (playQueue.length > 0) {
      const nextStory = playQueue[0]; // Get the first story in the queue
      setPlayQueue(playQueue.slice(1)); // Remove the first story from the queue
      return nextStory;
    }
    return null;
  };

  const [playQueue, setPlayQueue] = useState<Story[]>([]);

  // Custom function to play the video
  const playVideo = async () => {
    if (videoElement) {
      await videoElement.play().then(() => {
        videoReadyToPlay = false; // Reset the flag
        console.log('Video started playing');
      }).catch((error) => {
        console.error('Error playing video:', error);
      });
    }
  };

  const pauseVideo = async () => {
    if (videoElement) {
      videoElement.pause();
      console.log('Video paused');
    }
  };

  const stopVideo = async () => {
    if (videoElement) {
      videoElement.pause()
      videoElement.currentTime = 0;
      videoReadyToPlay = false; // Reset the flag
      console.log('Video stopped');
    }
  }

  // Playback only from an audio url
  const playAudio = async (audioUrl: string): Promise<void> => {
    return new Promise(async (resolve) => {
      try {
        if (audioRef.current && !audioRef.current.paused) {
          console.log('Audio is already playing');
          resolve();
          throw new Error('Audio is already playing');
        }

        if (typeof window === 'undefined') {
          console.log('Audio playback is not available in this environment');
          resolve();
          throw new Error('Audio playback is not available in this environment');
        }

        if (videoElement && isVideo === true) {
          console.log('Attempting to play video...');
          // Check if the video is ready to play
          playVideo();
        } else {
          console.log(`Video is not available, playing only audio isVideoRef: ${isVideo ? "true" : "false"} videoElementRef: ${videoElement ? "set" : "unset"}...`)
        }

        // Playback the audio using the browser's built-in capabilities.
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.play();

        audio.addEventListener(
          'ended',
          () => {
            if (isVideo) { // Check if the video is playing
              pauseVideo();
            } else if (isVideo && videoElement) {
              console.error(`Audio Ended: Video is not playing. isPlaying: ${isPlaying}, isVIdeoRef: ${isVideo}`);
            }
            resolve();
          },
          false
        );
      } catch (error) {
        console.error('Error in playing audio, error:', error);
        resolve();
        throw error;
      }
    });
  };

  // Playback audio and subtitle + image or video
  const playAudioAndSubtitle = async (audioFile: string, subtitle: string, localImageUrl: string) => {
    return new Promise<void>(async (resolve) => {
      // Update the text without removing and adding to the stage
      if (subtitleTextRef.current) {
        subtitleTextRef.current.text = subtitle;
      }

      // Update the image or video
      const localIsVideo = /\.(mp4|webm|ogg)$/i.test(localImageUrl);
      setIsVideo(localIsVideo);
      if (localImageUrl && localImageUrl !== '') {
        if (localIsVideo && videoElement) {
          // switch out the video if it's different
          if (localImageUrl != currentUrl) {
            setImageUrl(localImageUrl);
          }
        } else {
          // switch out the image if it's different
          if (localImageUrl != currentUrl && spriteRef.current) {
            const texture = PIXI.Texture.from(localImageUrl);
            spriteRef.current.texture = texture;
            spriteRef.current.texture.update();
          }
        }
      }

      await playAudio(audioFile)
        .then(() => resolve())
        .catch((error) => {
          console.error('Error playing audio:', error);
          resolve();
        });
    });
  };

  // Playback a Scene from the story
  const playScene = (scene: Scene) => {
    return scene.sentences.reduce(async (promise, sentence) => {
      await promise;
      return await playAudioAndSubtitle(sentence.audioFile, sentence.text, sentence.imageUrl || '');
    }, Promise.resolve());
  };

  const playStory = async (story: Story): Promise<boolean> => {
    if (selectedTheme !== 'MultiModal') {
      tearDownPIXI();
      return true;
    }
    if (!story) {
      console.error(`playStory: story is null`);
      return false;
    } else {
      console.log(`playStory: Playing ${story.title} ${story.scenes.length} scenes.`);
    }

    if (story.scenes) {
      console.log(`playScene: Playing ${story.title} ${story.scenes.length} scenes.`);
      try {
        for (const scene of story.scenes) {
          console.log(`playScene: Playing ${story.title} scene ${scene.id} of ${story.scenes.length} scenes.`);
          await playScene(scene);
        }
      } catch (error) {
        console.error(`playScene: Error playing scene: ${error}`);
      }

      // Reset the image and text to defaults
      if (isVideo && videoElement) {
        try {
          await stopVideo();
        } catch (error) {
          console.error(`playScene: Error stopping video: ${error}`);
        }
      }

      console.log(`playScene: Finished playing ${story.title} ${story.scenes.length} scenes.`);
      return true;
    } else {
      console.error(`playStory: story.scenes is null or empty`);
      return false;
    }
  };

  // Playback the story from the queue
  useEffect(() => {
    const play = async (story: Story) => {
      console.log(`AnimateStoryPlay: attempting to play story ${story ? story.id : "(story is empty)"}.`);
      if (!story || (story && !story.scenes)) {
        console.error(`AnimateStoryPlay: story is null or story.scenes is null or empty ${story ? story.id : "(story is empty)"} has ${story && story.scenes ? story.scenes.length : "no scenes"}.}`);
        return;
      }
      try {
        await playStory(story);
      } catch (error) {
        console.error(`AnimateStoryPlay: Error playing story ${story ? story.id : "(story is empty)"}. ${error}`);
      }
    };

    const playFromQueue = async () => {
      if (playQueue.length > 0 && !isPlaying) {
        const story = removeFromQueue();
        if (story) {
          console.log(`Playing story ${story.title} from queue...`);
          try {
            setIsPlaying(true);
            await play(story);
          } catch (error) {
            console.error("An error occurred during playback:", error);
          }
          setIsPlaying(false);
        } else {
          console.log("No valid story to play.");
        }
        console.log(`playFromQueue: Finished playing story ${story ? story.title : "(story is empty)"}.`);

        // update the subtitle text to the default message
        if (selectedTheme === 'MultiModal' && !isPlaying) {
          setIsPlaying(true);
          if (subtitleTextRef.current) {
            setLoadingOSD('Welcome to Groovy the AI Bot.');

            let displayMessage = `-*- ${selectedPersonality.toUpperCase()} -*- \nWelcome, I can tell you a story or answer your questions.`;
            if (!isPlaying && displayMessage !== '') {
              setImageUrl(defaultGaib);
              subtitleTextRef.current.text = displayMessage;
            }
          }
          setIsPlaying(false);
        }
      }
    };

    // Schedule the first invocation
    const timeoutId = setTimeout(playFromQueue, 1000);

    // Cleanup
    return () => {
      clearTimeout(timeoutId);  // <-- Clear the timeout
    };
  }, [playQueue, isPlaying]);

  // App setup initialization
  const setupApp = () => {
    if (selectedTheme !== 'MultiModal') {
      tearDownPIXI();
      return;
    }
    if (!appRef.current && faceContainerRef.current) {
      let width = faceContainerRef.current?.clientWidth || window.innerWidth;
      let height = faceContainerRef.current?.clientHeight || window.innerHeight;
      setContainerWidth(width);
      setContainerHeight(height);

      const app = new PIXI.Application({
        width: width,
        height: height,
        backgroundAlpha: 0,
        antialias: true,
        backgroundColor: 0x000000,
      });

      if (app) {
        // Enable sorting of the children
        app.stage.sortableChildren = true;

        // Add the PIXI app to the container
        faceContainerRef.current.appendChild(app.view);

        // Store the app in the ref
        appRef.current = app; // Store the app in the ref

        console.log(`setupApp: PIXI app initialized with resolution ${app.view.width}x${app.view.height}`);
      } else {
        console.error(`setupApp: PIXI app is null`);
      }
    } else {
      console.log(`setupApp: appRef.current is not null, not initializing PIXI app.`);
    }
  };

  // Resize the PIXI app
  useEffect(() => {
    // Resize handler
    const resizeHandler = () => {
      if (selectedTheme !== 'MultiModal' || faceContainerRef.current === null) {
        tearDownPIXI();
        return;
      }
      if (faceContainerRef.current) {
        if ((faceContainerRef.current.clientWidth && faceContainerRef.current.clientHeight) || (window.innerWidth && window.innerHeight)) {
          // resize app
          if (appRef.current && appRef.current.renderer) {
            const newWidth = faceContainerRef.current?.clientWidth || window.innerWidth;
            const newHeight = faceContainerRef.current?.clientHeight || window.innerHeight;

            // Update the container dimensions
            setContainerWidth(newWidth);
            setContainerHeight(newHeight);

            // Update the text
            if (subtitleTextRef.current) {
              subtitleTextRef.current.x = newWidth / 2; // Centered on the container
              subtitleTextRef.current.y = newHeight - 24 * 1.2 * 10; // N lines up from the bottom of the container
            }

            if (statusBarTextRef.current) {
              statusBarTextRef.current.x = 2; // Centered on the container
              statusBarTextRef.current.y = 2; // N lines up from the bottom of the container
            }

            // Update the image or video
            if (spriteRef.current) {
              // Determine the best scale to maintain the original aspect ratio
              if (spriteRef.current.texture.width > spriteRef.current.texture.height) {
                const scale = Math.min(newWidth / spriteRef.current.texture.width, newHeight / spriteRef.current.texture.height);
                spriteRef.current.scale.set(scale);
              }

              // Update the sprite's position to be centered in the container
              spriteRef.current.x = newWidth / 2;
              spriteRef.current.y = newHeight / 2;
              spriteRef.current.anchor.set(0.5);
              spriteRef.current.zIndex = 1;
            }

            // Resize the PIXI app
            appRef.current.renderer.resize(newWidth, newHeight);

            console.log(`resizeHandler: Resizing to ${newWidth}x${newHeight}`);
          } else {
            console.error(`resizeHandler: appRef.current is null`);
          }
        } else {
          console.error(`resizeHandler: faceContainerRef.current dimensions are not available. window is ${window.innerWidth}x${window.innerHeight}`);
        }
      } else {
        console.error(`resizeHandler: faceContainerRef.current is null`);
      }
    };
    if (window) {
      console.log(`resizeHandler: Adding resize handler...`);
      window.addEventListener('resize', resizeHandler);
    }

    return () => {
      console.log(`resizeHandler: Removing resize handler...`);
      try {
        if (window && selectedTheme === 'MultiModal') {
          window.removeEventListener('resize', resizeHandler);
        }
        // remove the image and text
        if (selectedTheme !== 'MultiModal') {
          tearDownPIXI();
        }
      } catch (error) {
        console.error(`Error in removing resize handler: ${error}`);
      }
    };
  }, []);

  // setup or update the text
  const setupText = (textString: string) => {
    const textStyle = new TextStyle({
      fontSize: 48,
      fontWeight: 'bolder',
      fill: 'white',
      fontFamily: 'Trebuchet MS',
      lineHeight: 48, // 1.2 times the font size
      align: 'center',
      wordWrap: true, // Enable word wrap
      wordWrapWidth: containerWidth - 40, // Set word wrap width with some padding
      dropShadow: true,
      dropShadowAngle: Math.PI / 6,
      dropShadowBlur: 3,
      dropShadowDistance: 6,
      padding: 2,
      dropShadowColor: '#000000',
    });

    const richText = new PIXI.Text(textString, textStyle);
    richText.x = containerWidth / 2; // Centered horizontally in the container
    richText.anchor.x = 0.5; // Center-align the text horizontally
    richText.y = containerHeight - 24 * 1.2 * 10; // N lines up from the bottom of the container
    richText.zIndex = 10; // Set the zIndex of the text object

    // Remove the existing sprite from the stage if it exists
    if (appRef.current?.stage) {
      if (subtitleTextRef.current) {
        // Destroy previous texture if it exists
        appRef.current.stage.removeChild(subtitleTextRef.current);
        subtitleTextRef.current.texture.destroy(true); // Pass true to destroy the base texture as well
      }
      appRef.current.stage.addChild(richText);
    }
    subtitleTextRef.current = richText;
  };

  const setupStatusBar = () => {
    const statusBarTextStyle = new TextStyle({
      fontSize: 24,
      fontWeight: 'lighter',
      fill: 'yellow',
      fontFamily: 'Trebuchet MS',
      lineHeight: 24, // 1.2 times the font size
      align: 'left',
      wordWrap: true, // Enable word wrap
      wordWrapWidth: containerWidth - 80, // Set word wrap width with some padding
      dropShadow: true,
      dropShadowAngle: Math.PI / 6,
      dropShadowBlur: 3,
      dropShadowDistance: 6,
      padding: 4,
      dropShadowColor: '#000000',
    });

    const statusBarText = new PIXI.Text("Loading...", statusBarTextStyle);
    statusBarText.x = 2; // Centered horizontally in the container
    statusBarText.anchor.x = 0; // Center-align the text horizontally
    statusBarText.y = 2; // N lines up from the bottom of the container
    statusBarText.zIndex = 10; // Set the zIndex of the text object

    // Remove the existing sprite from the stage if it exists
    if (appRef.current?.stage) {
      if (statusBarTextRef.current) {
        // Destroy previous texture if it exists
        appRef.current.stage.removeChild(statusBarTextRef.current);
        statusBarTextRef.current.texture.destroy(true); // Pass true to destroy the base texture as well
      }
      appRef.current.stage.addChild(statusBarText);
    }
    statusBarTextRef.current = statusBarText;
  };

  const setupEpisodeOverlay = (episodes: Episode[]) => {
    // Define the text style
    const episodeTextStyle = new PIXI.TextStyle({
      fontSize: 24,
      fontWeight: 'lighter',
      fill: 'yellow',
      fontFamily: 'Trebuchet MS',
      lineHeight: 24,
      align: 'left',
      wordWrap: false, // Disable word wrapping
      wordWrapWidth: containerWidth - 20,
      dropShadow: true,
      dropShadowAngle: Math.PI / 6,
      dropShadowBlur: 3,
      dropShadowDistance: 6,
      padding: 1,
      dropShadowColor: '#000000'
    });

    // Generate the episode text
    let episodeText = '';
    episodes.reverse().forEach((episode: Episode, index: number) => {
      episodeText += `* ${episode.type === 'question' ? "Question" : "Story"} ${episodes.length - index}: ${episode.username} said "${episode.title}"\n`;
    });

    // Create the PIXI Text object
    const episodeOverlayText = new PIXI.Text(episodeText, episodeTextStyle);

    // Create a background using PIXI Graphics
    const background = new PIXI.Graphics();
    background.beginFill(0x000000, 0.5); // black color, 0.5 alpha

    // Set background dimensions based on screen size
    const topBottomBorder = 50; // Set the top and bottom borders
    const sideBorder = 20; // Set the side borders

    // Set background dimensions to match the text
    background.drawRect(
      sideBorder + 10,
      topBottomBorder + 10,
      episodeOverlayText.width + 20,  // Add some padding to width
      episodeOverlayText.height + 20  // Add some padding to height
    );
    background.endFill();

    // Set the position for both text and background
    episodeOverlayText.x = sideBorder + 10; // Slightly offset from the left side border
    episodeOverlayText.y = topBottomBorder + 10; // Slightly offset from the top border

    background.zIndex = 9;
    episodeOverlayText.zIndex = 10;

    // Add to the stage
    if (appRef.current?.stage) {
      if (episodeOverlayTextRef.current) {
        // Destroy previous text if it exists
        appRef.current.stage.removeChild(episodeOverlayTextRef.current);
        episodeOverlayTextRef.current.texture.destroy(true);
      }
      if (backgroundOverlayTextRef.current) {
        // Destroy previous background if it exists
        appRef.current.stage.removeChild(backgroundOverlayTextRef.current);
        backgroundOverlayTextRef.current.destroy(true);
      }
      appRef.current.stage.addChild(background);
      appRef.current.stage.addChild(episodeOverlayText);
    }

    // Store the reference
    episodeOverlayTextRef.current = episodeOverlayText;
    backgroundOverlayTextRef.current = background;
  };

  const tearDownPIXI = () => {
    // Remove all children from the stage
    appRef.current?.stage.removeChildren();

    // Destroy sprite and its texture
    if (spriteRef.current) {
      appRef.current?.stage.removeChild(spriteRef.current);
      spriteRef.current.texture.destroy(true);
      spriteRef.current.destroy();
      spriteRef.current = null;
    }

    // Destroy video element
    if (videoElement) {
      videoElement.pause();
      videoElement.src = '';
      videoElement.load();
    }

    // Destroy subtitle text and its texture
    if (subtitleTextRef.current) {
      subtitleTextRef.current.texture.destroy(true);
      subtitleTextRef.current.destroy();
      subtitleTextRef.current = null;
    }

    // Destroy episode overlay text and its texture
    if (episodeOverlayTextRef.current) {
      episodeOverlayTextRef.current.texture.destroy(true);
      episodeOverlayTextRef.current.destroy();
      episodeOverlayTextRef.current = null;
    }

    // Destroy background overlay
    if (backgroundOverlayTextRef.current) {
      backgroundOverlayTextRef.current.clear();
      backgroundOverlayTextRef.current.destroy();
      backgroundOverlayTextRef.current = null;
    }

    // Destroy the PIXI application instance
    if (appRef.current) {
      appRef.current.destroy(true);
      appRef.current = null;
    }

    return;
  };

  // Use the function
  useEffect(() => {
    if (selectedTheme !== 'MultiModal') {
      tearDownPIXI();
      return;
    }
    if (episodes.length > 0 && !isPlaying) {
      setupEpisodeOverlay(episodes);
    } else {
      // Remove the overlay if it exists and isPlaying is true
      if (appRef.current?.stage && episodeOverlayTextRef.current) {
        appRef.current.stage.removeChild(episodeOverlayTextRef.current);
        episodeOverlayTextRef.current.texture.destroy(true);
        episodeOverlayTextRef.current = null;
      }
      // Similarly, remove the background if you added one
      if (appRef.current?.stage && backgroundOverlayTextRef.current) {
        appRef.current.stage.removeChild(backgroundOverlayTextRef.current);
        backgroundOverlayTextRef.current.clear();
        backgroundOverlayTextRef.current = null;
      }
    }
  }, [episodes, isPlaying]);

  const setupVideoOrImage = async (imageOrVideo: string) => {
    const isVideoLocal: boolean = /\.(mp4|webm|ogg)$/i.test(imageOrVideo);
    setIsVideo(isVideoLocal);

    if (selectedTheme !== 'MultiModal') {
      // tear down if not multimodal
      tearDownPIXI();
      return;
    }

    // Check if the video resource already exists in the loader's cache
    if (loaderRef.current && !loaderRef.current.resources[imageOrVideo]) {
      loaderRef.current.add(imageOrVideo);
    } else if (loaderRef.current) {
      console.log(`setupVideoOrImage: loaderRef.current.resources[${imageOrVideo}] already exists`);
    } else {
      console.log(`setupVideoOrImage: loaderRef.current is null`);
    }

    // Handler for the 'loadstart' even
    const loadstartHandler = () => {
      console.log(`Load started for ${imageOrVideo}`);
    };

    // Handler for the 'progress' event
    let lastProgressLogTime = 0;
    const progressHandler = () => {
      const currentTime = Date.now();
      // Log progress only if more than 1 second has passed since the last log
      if (currentTime - lastProgressLogTime > 1000) {
        console.log(`Progress event fired ${currentTime - lastProgressLogTime}ms since last log for ${imageOrVideo}`);
        lastProgressLogTime = currentTime;
      }
    };

    // Handler for the 'ended' event
    const endedHandler = () => {
      console.log('Video ended');
      if (videoElement) {
        videoElement.currentTime = 0;
      }
      videoReadyToPlay = false; // Reset the flag
    };

    /// Handler for the 'canplay' event
    const canplayHandler = () => {
      console.log(`Video ${imageOrVideo} can play ${videoElement?.videoWidth}x${videoElement?.videoHeight} ${videoElement?.duration}s ${videoElement?.readyState}`);
      videoReadyRef.current = true; // Set the video as ready to play
      videoReadyToPlay = true; // Set the flag
    };

    // Handler for the 'loadeddata' event
    const loadeddataHandler = () => {
      console.log(`Video data loaded for ${imageOrVideo} ${videoElement?.videoWidth}x${videoElement?.videoHeight} ${videoElement?.duration}s ${videoElement?.readyState}`);
    };

    // Handler for the 'error' event
    const errorHandler = () => {
      console.log(`Video ${imageOrVideo} error occurred ${videoElement?.error?.code} ${videoElement?.error?.message}`);
      videoReadyToPlay = false; // Reset the flag
    };

    // Handler for the 'abort' event
    const abortHandler = () => {
      console.log(`Video ${imageOrVideo} loading aborted ${videoElement?.error?.code} ${videoElement?.error?.message}`);
    };

    // Initialize or re-initialize the video element
    const initVideoElement = () => {
      if (videoElement) {
        videoElement.pause();
        videoElement.src = ''; // Clear the existing source
        videoElement.load(); // Reset the video element
      }
    };

    // Explicit event listener cleanup
    const removeEventListeners = () => {
      if (videoElement) {
        videoElement.removeEventListener('loadstart', loadstartHandler);
        videoElement.removeEventListener('progress', progressHandler);
        videoElement.removeEventListener('ended', endedHandler);
        videoElement.removeEventListener('canplay', canplayHandler);
        videoElement.removeEventListener('loadeddata', loadeddataHandler);
        videoElement.removeEventListener('error', errorHandler);
        videoElement.removeEventListener('abort', abortHandler);
      }
    };

    if (isVideoLocal && loaderRef.current && loaderRef.current.resources[imageOrVideo]) {
      // Re-initialize the video element and remove existing event listeners
      initVideoElement();
      removeEventListeners();

      // Load video into PixiJS sprite using the shared loader
      loaderRef.current.load(async (loader: PIXI.Loader, resources: Partial<Record<string, PIXI.LoaderResource>>) => {
        const videoResource = resources[imageOrVideo];

        if (videoResource) {
          // Create a video texture from the video resource
          const localVideoElement: HTMLVideoElement = videoResource.data as HTMLVideoElement;
          setVideoElement(localVideoElement);
          console.log(`setupVideoOrImage: videoResource setup resolution=${localVideoElement.videoWidth}x${localVideoElement.videoHeight}`);
          if (localVideoElement.videoWidth && localVideoElement.videoHeight) {
            const originalAspectRatio = localVideoElement.videoWidth / localVideoElement.videoHeight;
            console.log(`setupVideoOrImage: videoResource setup originalAspectRatio=${originalAspectRatio}`);
          }
          const videoTexture: PIXI.Texture = PIXI.Texture.from(localVideoElement);
          const videoSprite: PIXI.Sprite = new PIXI.Sprite(videoTexture as PIXI.Texture);

          let originalAspectRatio = 1;

          if (videoTexture && videoTexture.width && videoTexture.height) {
            originalAspectRatio = videoTexture.width / videoTexture.height;
          }

          // Set the width to the container width and adjust the height to maintain the original aspect ratio
          videoSprite.width = containerWidth;
          videoSprite.height = containerWidth / originalAspectRatio; // Height based on original aspect ratio

          // Move the sprite to the center of the screen
          videoSprite.x = containerWidth / 2;
          videoSprite.y = containerHeight / 2;
          videoSprite.anchor.set(0.5);

          videoSprite.zIndex = 1;

          console.log(`setupVideoOrImage: videoSprite setup resolution=${videoSprite.x}x${videoSprite.y} anchor=${videoSprite.anchor.x},${videoSprite.anchor.y} zIndex=${videoSprite.zIndex}`);

          // Set the loop property to false
          if (localVideoElement) {
            localVideoElement.loop = true;
            localVideoElement.muted = true;
            localVideoElement.autoplay = false;
            localVideoElement.crossOrigin = 'anonymous'; // Allow cross-origin videos

            // Explicitly set the src and load the video
            localVideoElement.src = imageOrVideo;
            localVideoElement.load();

            setTimeout(() => {
              // sleep and let the video play for a bit
              playVideo(); // Start playing the video            
            }, 1000);
            setTimeout(() => {
              // sleep and let the video play for a bit
              pauseVideo();
            }, 1000);

            // Add the event listeners
            localVideoElement.addEventListener('loadstart', loadstartHandler);
            localVideoElement.addEventListener('progress', progressHandler);
            localVideoElement.addEventListener('ended', endedHandler);
            localVideoElement.addEventListener('canplay', canplayHandler);
            localVideoElement.addEventListener('loadeddata', loadeddataHandler);
            localVideoElement.addEventListener('error', errorHandler);
            localVideoElement.addEventListener('abort', abortHandler);

            console.log(`setupVideoOrImage: videoElement setup resolution=${localVideoElement.videoWidth}x${localVideoElement.videoHeight} anchor=${videoSprite.anchor.x},${videoSprite.anchor.y} zIndex=${videoSprite.zIndex}`)
          }

          // Remove the existing sprite from the stage if it exists
          if (appRef.current?.stage) {
            // Destroy previous texture if it exists
            if (spriteRef.current) {
              spriteRef.current.texture.destroy(true); // Pass true to destroy the base texture as well
              appRef.current.stage.removeChild(spriteRef.current);
            }
            appRef.current.stage.addChild(videoSprite);
          }
          spriteRef.current = videoSprite;
          setCurrentUrl(imageOrVideo);

          console.log(`Video sprite attached ${imageOrVideo}`); // Log the sprite
        } else {
          console.error(`setupVideoOrImage: videoResource is null`);
        }
      });
    } else if (loaderRef.current && loaderRef.current.resources[imageOrVideo]) {
      // Load video into PixiJS sprite using the shared loader
      loaderRef.current.load((loader: PIXI.Loader, resources: Partial<Record<string, PIXI.LoaderResource>>) => {
        const imageResource = resources[imageOrVideo];

        if (imageResource) {
          const imageTexture: PIXI.Texture = PIXI.Texture.from(imageResource.data as HTMLVideoElement);
          const image: PIXI.Sprite = new PIXI.Sprite(imageTexture as PIXI.Texture);

          // Center the sprite's anchor point
          image.anchor.set(0.5);

          let originalAspectRatio = 1;
          // Calculate the original aspect ratio
          if (imageTexture && imageTexture.width && imageTexture.height) {
            originalAspectRatio = imageTexture.width / imageTexture.height;
          }

          // Set the width to the container width and adjust the height to maintain the original aspect ratio
          image.width = containerWidth;
          image.height = containerWidth / originalAspectRatio; // Height based on original aspect ratio

          // Move the sprite to the center of the screen
          image.x = containerWidth / 2;
          image.y = containerHeight / 2;

          // Add the sprite to the stage
          image.zIndex = 1;

          console.log(`setupVideoOrImage: image setup resolution=${image.x}x${image.y} anchor=${image.anchor.x},${image.anchor.y} zIndex=${image.zIndex}`);

          // Remove the existing sprite from the stage if it exists
          if (appRef.current?.stage) {
            // Destroy previous texture if it exists
            if (spriteRef.current) {
              spriteRef.current.texture.destroy(true); // Pass true to destroy the base texture as well
              appRef.current.stage.removeChild(spriteRef.current);
            }
            appRef.current.stage.addChild(image);
          }
          spriteRef.current = image;

          console.log(`Image sprite attached ${imageOrVideo}`); // Log the sprite
          setCurrentUrl(imageOrVideo);
        }
      });
    } else {
      console.log(`setupVideoOrImage: loaderRef.current is null or loaderRef.current.resources[${imageOrVideo}] is null`);
    }

    // Return teardown functions to remove the listeners
    return () => {
      removeEventListeners();
    };
  };

  // Load App on mount
  useEffect(() => {
    if (faceContainerRef.current && !appRef.current) {
      try {
        if (selectedTheme === 'MultiModal') {
          setupApp();
          if (!isPlaying) {
            setupText(subtitle);
            setupStatusBar();
            setupEpisodeOverlay(episodes);
            setupVideoOrImage(imageUrl);
          } else {
            console.log(`setupApp: isPlaying is true, not loading default text, status bar, or image/video`);
          }
        } else {
          console.log(`setupApp: selectedTheme is not MultiModal, not loading default text, status bar, or image/video`);
          // remove PIXI app if it exists
          if (appRef.current) {
            setupApp();
          }
        }
      } catch (error) {
        console.error(`Error loading App defaults: ${error}`);
      }
    }

    return () => {
      if (appRef.current) {
        console.log(`Destroying PIXI app`);
        appRef.current.destroy();
        appRef.current = null;
      }
    };
  }, []);

  // Load the default subtitle
  useEffect(() => {
    if (faceContainerRef.current && appRef.current && !isPlaying) {
      // Setup the PIXI app
      try {
        // Load the default text
        if (!isPlaying && selectedTheme === 'MultiModal') {
          setupText(subtitle);
        }
      } catch (error) {
        console.error(`Error loading Text defaults: ${error}`);
      }
    }
  }, [faceContainerRef.current, subtitle]);

  useEffect(() => {
    if (faceContainerRef.current && appRef.current) {
      // Setup the PIXI app
      try {
        // Load the default text
        if (!isPlaying && selectedTheme === 'MultiModal') {
          setupStatusBar();
        }
      } catch (error) {
        console.error(`Error loading Status Bar defaults: ${error}`);
      }
    }
  }, [faceContainerRef.current]);

  const updateStatusBar = async () => {
    if (faceContainerRef.current && appRef.current && statusBarTextRef.current) {
      // Setup the message to replace current text with
      let message = loadingOSD;
      let statusDetails =
        `${isSubmitQueueRef.current
          ? 'Submitting' : '.'} ${episodes.length > 0
            ? `Episodes:${episodes.length}` : '.'} ${isPlaying
              ? 'Playing' : '.'} ${playQueue.length > 0
                ? `playQueue:${playQueue.length}` : '.'} ${isProcessingNewsRef.current
                  ? 'News[on]' : '.'} ${isProcessingTwitchRef.current
                    ? 'Twitch[on]' : '.'} ${lastStatusMessage.current
                      ? lastStatusMessage.current : '.'}`;
      statusBarTextRef.current.text = `     ${message} ${statusDetails}`;
    }
  };

  useEffect(() => {
    updateStatusBar();

    // check if there are any episodes left, if so we don't need to sleep
    const intervalId = setInterval(updateStatusBar, 1000);  // Then every N seconds

    return () => clearInterval(intervalId);  // Clear interval on unmount
  }, [faceContainerRef, loadingOSD, statusBarTextRef, episodes, isPlaying, playQueue, isProcessingNewsRef, isProcessingTwitchRef, lastStatusMessage]);

  // Load the default image
  useEffect(() => {
    if (faceContainerRef.current && appRef.current && !isPlaying) {
      try {
        // Load the default image
        console.log(`setupVideoOrImage: Loading default image ${imageUrl}`);
        setupVideoOrImage(imageUrl);
      } catch (error) {
        console.error(`Error loading Image/Video defaults: ${error}`);
      }
    } else {
      console.log(`setupVideoOrImage: appRef.current is null or isPlaying is true`);
    }
  }, [faceContainerRef.current, imageUrl]);

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

  const twitchStory = async (story: Story): Promise<boolean> => {
    // Extract all unique speakers for twitch channel chat responses
    if (channelId !== '' && twitchChatEnabled) {
      let title: string = '';
      let summary: string = '';

      // Create a title for the story from the first sentence
      title = story.title.slice(0, 30);  // Limit the title to 100 characters

      // Create a brief introduction of the story from the second sentence
      const introduction = story.rawText.length > 1 ? story.rawText.substring(0, 30) : '';  // Limit the introduction to 100 characters

      // Create the summary
      if (story.isStory) {
        summary = `Title: ${title}.\n\nScript: ${introduction}...`;
      } else {
        summary = `Question: ${title}.\n\nAnswer: ${introduction}...`;
      }

      // Post the summary to the API endpoint
      try {
        await postResponse(channelId, summary, user?.uid);
      } catch (error) {
        console.error('Failed to post response: ', error);
      }
    }
    return true;
  };

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

      await twitchStory(storyToShare);

      return shareUrl;
    } catch (error) {
      console.error('An error occurred in the shareStory function:', error); // Check for any errors
      return '';
    }
  };

  // Twitch Chat fetching for automating input via a Twitch chat (costs if runs too much, watch out!!!)
  useEffect(() => {
    async function fetchEpisodeData() {
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
          gptPrompt: buildPrompt(selectedPersonality as keyof typeof PERSONALITY_PROMPTS, item.type == 'episode' ? true : false),
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
      if (isFetching && channelId !== '' && twitchChatEnabled && !isProcessingTwitchRef.current) {
        isProcessingTwitchRef.current = true;
        try {
          await fetchEpisodeData();
        } catch (error) {
          console.error('An error occurred in the fetchEpisodeData function:', error); // Check for any errors
        }
        isProcessingTwitchRef.current = false;
      }
    };

    try {
      processTwitchChat();  // Run immediately on mount
    } catch (error) {
      console.error('An error occurred in the fetchEpisodeData function:', error); // Check for any errors
    }

    // check if there are any episodes left, if so we don't need to sleep
    const intervalId = setInterval(processTwitchChat, 10000);  // Then every N seconds

    return () => clearInterval(intervalId);  // Clear interval on unmount
  }, [channelId, twitchChatEnabled, isFetching, episodes, user, isProcessingTwitchRef, selectedPersonality, selectedNamespace, parseQuestion]);

  // News fetching for automating input via a news feed
  useEffect(() => {
    const processNewsArticle = async () => {
      if (isFetching && !isProcessingNewsRef.current && feedNewsChannel && newsFeedEnabled && episodes.length <= 1) {
        isProcessingNewsRef.current = true;

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

        isProcessingNewsRef.current = false;
      }
    };

    try {
      processNewsArticle();  // Run immediately on mount
    } catch (error) {
      console.error('An error occurred in the processNewsArticle function:', error);
      isProcessingNewsRef.current = false;
    }

    const intervalId = setInterval(processNewsArticle, 1000);  // Then every N seconds

    return () => clearInterval(intervalId);  // Clear interval on unmount
  }, [isFetching, currentNewsIndex, news, setCurrentNewsIndex, feedPrompt, episodes, isStory, feedNewsChannel, newsFeedEnabled, isProcessingNewsRef, currentOffset, feedCategory, feedKeywords, feedSort, maxQueueSize, selectedNamespace, selectedPersonality, parseQuestion]);

  // Display the personality that is default on load and when no playback is occuring
  useEffect(() => {
    async function updatePersonality() {
      if (!isPlaying) {
        // Override the imageUrl with ones from PERSONALITY_IMAGES if the personality is in the list
        let personalityImageUrl = '';
        let localPersonality = selectedPersonality;
        if (PERSONALITY_IMAGES[localPersonality as keyof typeof PERSONALITY_IMAGES]) {
          personalityImageUrl = PERSONALITY_IMAGES[localPersonality as keyof typeof PERSONALITY_IMAGES];
        }

        if (personalityImageUrl != '') {
          setPersonalityImageUrls((state) => ({ ...state, [localPersonality]: personalityImageUrl }));
        } else if (!personalityImageUrls[localPersonality]) {
          let imageId = uuidv4().replace(/-/g, '');
          let gaibImage = await generateImageUrl("Portrait shot of the personality: " + buildPrompt(localPersonality, false).slice(0, 2000), true, '', localPersonality, imageId);
          if (gaibImage !== '') {
            setPersonalityImageUrls((state) => ({ ...state, [localPersonality]: gaibImage }));
          }
        }
        setLoadingOSD('Welcome to Groovy the AI Bot.');

        // setup selectedPersonalities image in cache
        let localImageUrl = defaultGaib;
        if (localPersonality && personalityImageUrls[localPersonality]) {
          setImageUrl(personalityImageUrls[localPersonality]);
          localImageUrl = personalityImageUrls[localPersonality];
        } else {
          setImageUrl(defaultGaib);
        }
        let displayMessage = `-*- ${localPersonality.toUpperCase()} -*- \nWelcome, I can tell you a story or answer your questions.`;
        if (subtitleTextRef.current) {
          subtitleTextRef.current.text = displayMessage;
        } else {
          setSubtitle(displayMessage);
        }
      } else {
        console.log(`updatePersonality: isPlaying=${isPlaying} so not updating personality`);
      }
    }

    updatePersonality();
  }, [selectedPersonality, isPlaying, subtitle]); // Dependency array ensures this runs when selectedPersonality or isDisplayingRef.current changes


  // On initial load, fill the personalityImageUrls with the personalities for each image listed in the PERSONALITY_IMAGES object
  useEffect(() => {
    async function updatePersonalityImages() {
      // Iterate over all the personalities in PERSONALITY_IMAGES
      for (const [localPersonality, personalityImageUrl] of Object.entries(PERSONALITY_IMAGES)) {
        if (personalityImageUrl != '') {
          setPersonalityImageUrls((state) => ({ ...state, [localPersonality]: personalityImageUrl }));
        } else if (!personalityImageUrls[localPersonality]) {
          let imageId = uuidv4().replace(/-/g, '');
          let gaibImage = await generateImageUrl("Portrait shot of the personality: " + buildPrompt(localPersonality as keyof typeof PERSONALITY_PROMPTS , false).slice(0, 2000), true, '', localPersonality, imageId);
          if (gaibImage !== '') {
            setPersonalityImageUrls((state) => ({ ...state, [localPersonality]: gaibImage }));
          }
        }
      }
    }

    updatePersonalityImages();
  }, []); // Empty dependency array ensures this runs only on initial load

  // This function generates the AI message using GPT
  const generateAImessage = async (imagePrompt: string, personalityPrompt: string, maxTokens: number = 50): Promise<string> => {
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
      }, 60000);

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
      let prompt: string = imagePrompt;
      let content: string = '';
      if (gptPrompt) {
        content = await generateAImessage(imagePrompt, personalityPrompt);
        if (content !== '') {
          prompt = content;
        }
      }
      // Use the AI generated message as the prompt for generating an image URL.
      let gaibImage = await generateImageUrl(prompt.slice(0, 2000), true, localLastImage, episodeIdRef.current, count);
      return { image: gaibImage, prompt: prompt };
    } catch (error) {
      console.error("Image GPT Prompt + generateImageUrl Failed to generate an image URL:", error);
      return { image: '', prompt: imagePrompt };
    }
  };

  function addProsody(speaker: string, sentence: string, rate: number, pitch: number): string {
    let config: SpeakerConfig = speakerConfigs[speaker] || speakerConfigs['generic'];
    if (!speakerConfigs[speaker]) {
      console.log(`addProsody: speaker ${speaker} not found in speakerConfigs`);
      config.rate = rate;
      config.pitch = pitch;
    }
    let ssmlSentence = `<prosody rate="${config.rate}" pitch="${config.pitch}">${sentence}</prosody>`;

    if (config.emphasisWords) {
      config.emphasisWords.forEach(word => {
        const emphasisTag = `<emphasis level="strong">${word}</emphasis>`;
        ssmlSentence = ssmlSentence.split(word).join(emphasisTag);
      });
    }

    if (config.pauses) {
      config.pauses.forEach(pause => {
        const pauseTag = `${pause.word}<break time="${pause.duration}"/>`;
        ssmlSentence = ssmlSentence.split(pause.word).join(pauseTag);
      });
    }

    return ssmlSentence;
  }

  let maleVoiceModels = {
    'en-US': ['en-US-Neural2-J', 'en-US-Neural2-D', 'en-US-Neural2-I', 'en-US-Neural2-A'],
    'ja-JP': ['ja-JP-Neural2-C', 'ja-JP-Neural2-D', 'ja-JP-Wavenet-C', 'ja-JP-Wavenet-D'],
    'es-US': ['es-US-Wavenet-B', 'es-US-Wavenet-C', 'es-US-Wavenet-B', 'es-US-Wavenet-C'],
    'en-GB': ['en-GB-Wavenet-B', 'en-GB-Wavenet-D', 'en-GB-Wavenet-B', 'en-GB-Wavenet-D']
  };

  let femaleVoiceModels = {
    'en-US': ['en-US-Neural2-H', 'en-US-Neural2-E', 'en-US-Neural2-F', 'en-US-Neural2-G', 'en-US-Neural2-C'],
    'ja-JP': ['ja-JP-Neural2-B', 'ja-JP-Wavenet-A', 'ja-JP-Wavenet-B', 'ja-JP-Standard-A'],
    'es-US': ['es-US-Wavenet-A', 'es-US-Wavenet-A', 'es-US-Wavenet-A', 'es-US-Wavenet-A'],
    'en-GB': ['en-GB-Wavenet-A', 'en-GB-Wavenet-C', 'en-GB-Wavenet-F', 'en-GB-Wavenet-A']
  };

  let neutralVoiceModels = {
    'en-US': ['en-US-Neural2-H', 'en-US-Neural2-C', 'en-US-Neural2-F', 'en-US-Neural2-G', 'en-US-Neural2-E'],
    'ja-JP': ['ja-JP-Neural2-B', 'ja-JP-Wavenet-A', 'ja-JP-Wavenet-B', 'ja-JP-Standard-A'],
    'es-US': ['es-US-Wavenet-A', 'es-US-Wavenet-A', 'es-US-Wavenet-A', 'es-US-Wavenet-A'],
    'en-GB': ['en-GB-Wavenet-A', 'en-GB-Wavenet-C', 'en-GB-Wavenet-F', 'en-GB-Wavenet-A']
  };

  let defaultModels = {
    'en-US': 'en-US-Neural2-H',
    'ja-JP': 'ja-JP-Neural2-B',
    'es-US': 'es-US-Wavenet-A',
    'en-GB': 'en-GB-Wavenet-A'
  };

  function selectVoiceModel(text: string, gender: string): { language: string, model: string } {
    // Regular expression to detect Japanese characters (Kanji, Hiragana, Katakana)
    const japaneseRegex = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

    // Regular expression to detect Spanish characters (e.g., accented vowels)
    const spanishRegex = /[áéíóúñ]/;

    // Mapping based on gender
    const voiceMapping = gender === 'MALE' ? maleVoiceModels : femaleVoiceModels;

    // Check for Japanese characters
    if (japaneseRegex.test(text)) {
      return { language: 'ja-JP', model: voiceMapping['ja-JP'][0] }; // Select the first Japanese voice model based on gender
    }

    // Check for Spanish characters
    if (spanishRegex.test(text)) {
      return { language: 'es-US', model: voiceMapping['es-US'][0] }; // Select the first Spanish voice model based on gender
    }

    // Don't change the model
    return { language: '', model: '' };
  }

  function removeMarkdownAndSpecialSymbols(text: string): string {
    // Remove markdown formatting
    const markdownRegex = /(\*{1,3}|_{1,3}|`{1,3}|~~|\[\[|\]\]|!\[|\]\(|\)|<[^>]+>|\d+\.\s|\#+\s)/g;
    let cleanedText = text.replace(markdownRegex, '');

    // Remove content within brackets [content]
    const bracketContentRegex = /\[[^\]]*\]/g;
    cleanedText = cleanedText.replace(bracketContentRegex, '');

    // Remove any lines of just dashes like --- or ===
    const dashRegex = /^[-=]{3,}$/gm; // Added 'm' flag for multiline matching
    cleanedText = cleanedText.replace(dashRegex, '');

    // Remove lines with repeated special characters
    const repeatedSpecialCharsRegex = /^([@#^&*()":{}|<>])\1*$/gm; // Added 'm' flag for multiline matching
    cleanedText = cleanedText.replace(repeatedSpecialCharsRegex, '');

    // Remove special symbols (including periods)
    const specialSymbolsRegex = /[@#^&*()":{}|<>]/g;
    const finalText = cleanedText.replace(specialSymbolsRegex, '');

    // Remove extra spaces and line breaks
    return finalText.replace(/\s{2,}/g, ' ').trim();
  }

  async function fetchTranslation(text: string, targetLanguage: string): Promise<string> {
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

  async function getGaib() {
    const directoryUrl = process.env.NEXT_PUBLIC_GAIB_IMAGE_DIRECTORY_URL;
    const maxNumber = Number(process.env.NEXT_PUBLIC_GAIB_IMAGE_MAX_NUMBER);

    if (maxNumber > 1) {
      setCurrentNumber((currentNumber % maxNumber) + 1);
    } else {
      setCurrentNumber(maxNumber);
    }

    if (currentNumber < 1) {
      setCurrentNumber(1);
    }

    let url = process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE || '';
    if (directoryUrl != null && maxNumber >= 1 && currentNumber >= 1) {
      url = `${directoryUrl}/${currentNumber}.png`;
    }
    return url;
  }

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
              imageUUID: count,
            }),
          });
        } else {
          console.error(`ImageGeneration: Unknown image source ${imageSource}`);
          return await getGaib();
        }

        if (!response || !response.ok || response.status !== 200) {
          console.error(`ImageGeneration: No response received from Image Generation ${imageSource} API ${response ? response.statusText : ''}`);
          return '';
        }

        const data = await response.json();
        let duplicateImage = false;
        if (imageSource === 'pexels') {
          return data.photos[0].src.large2x;
        } else if ((imageSource === 'deepai' || imageSource == 'openai') && data.output_url) {
          const localImageUrl = data.output_url;
          if (data?.duplicate === true) {
            duplicateImage = true;
          }
          if (saveImages === 'true' && !duplicateImage && authEnabled) {
            // Store the image and index it
            await fetchWithAuth('/api/storeImage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ localImageUrl, episodeId: localEpisodeId, imageUUID: count }),
            });
          }
          const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET_NAME || '';
          if (bucketName !== '' && !duplicateImage) {
            return `https://storage.googleapis.com/${bucketName}/images/${localEpisodeId}/${count}.jpg`;
          } else {
            // don't store images in GCS or it is a duplicate image
            return localImageUrl;
          }
        } else if (imageSource === 'getimgai' && data.output_url) {
          const localImageUrl = data.output_url;
          if (data?.duplicate === true) {
            duplicateImage = true;
          }
          return localImageUrl;
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

  // lock speaking and avoid crashing
  async function processImagesAndSubtitles(story: Story): Promise<Story> {
    const message = story.rawText;
    let lastImage: string = await getGaib();

    console.log(`StoryQueue: Generating Story #${storyQueue.length}: ${story?.title}}.`);

    let voiceModels: { [key: string]: string } = {};
    let genderMarkedNames: any[] = [];
    let detectedGender: string = story.isStory ? gender : story.defaultGender;
    let currentSpeaker: string = story.personality;
    let defaultVoiceModel: string = story.isStory ? '' : story.defaultVoiceModel;
    let isContinuingToSpeak = false;
    let isSceneChange = false;
    let lastSpeaker = '';

    if (gender == `MALE`) {
      defaultModels = {
        'en-US': 'en-US-Neural2-J',
        'ja-JP': 'ja-JP-Nueral2-C',
        'es-US': 'es-US-Wavenet-B',
        'en-GB': 'en-GB-Wavenet-B'
      };
    }
    // Define default voice model for language
    const defaultModel = defaultVoiceModel != '' ? defaultVoiceModel : audioLanguage in defaultModels ? defaultModels[audioLanguage as keyof typeof defaultModels] : "";
    let model = defaultModel;
    let voiceRate = story.defaultVoiceRate;
    let voicePitch = story.defaultVoicePitch;

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

    // Scene and image prompt generation
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

    // get first sentence as title or question to display
    const sentences: string[] = nlp(message).sentences().out('array');
    let firstSentence = sentences.length > 0 ? sentences[0] : query;

    // walk through sentences and join the ones that are broken up with [SCENE: ... that end with a ] on a subsequent line
    let combinedSentences: string[] = [];
    let currentSceneOrInt: string = '';

    for (const sentence of sentences) {
      if (sentence.startsWith('[SCENE:') || sentence.startsWith('INT.')) {
        if (currentSceneOrInt) {
          combinedSentences.push(currentSceneOrInt); // Add the previous scene or INT. line to the result
        }
        currentSceneOrInt = sentence; // Start a new scene or INT. line
      } else if (currentSceneOrInt && (sentence.endsWith(']') || sentence.startsWith('INT.'))) {
        currentSceneOrInt += ' ' + sentence; // Append to the current scene or INT. line
        combinedSentences.push(currentSceneOrInt); // Add the completed scene or INT. line to the result
        currentSceneOrInt = ''; // Reset the current scene or INT. line
      } else {
        combinedSentences.push(sentence); // Add regular sentences to the result
      }
    }

    // If there's an unfinished scene or INT. line, add it to the result
    if (currentSceneOrInt) {
      combinedSentences.push(currentSceneOrInt);
    }

    // Create personality main image
    if (story.personality !== 'passthrough') {
      if (!personalityImageUrls[story.personality]) {
        let imageId = uuidv4().replace(/-/g, '');
        let gaibImage = await generateImageUrl("Portrait shot of the personality: " +
          buildPrompt(story.personality as keyof typeof PERSONALITY_PROMPTS, false).slice(0, 2000), true, '', story.personality, imageId);
        if (gaibImage !== '') {
          setPersonalityImageUrls((state) => ({ ...state, [story.personality]: gaibImage }));
          lastImage = gaibImage;
        }
      } else {
        lastImage = personalityImageUrls[story.personality];
      }
      imageCount++;
      promptImages.push(lastImage);
      promptImageTexts.push("Description of Personality: " + story.personality.toUpperCase());
    } else {
      lastImage = story.imageUrl;
    }

    const titleScreenImage: string = lastImage;
    const titleScreenText: string = firstSentence;

    // Extract the scene texts from the message
    let sentencesToSpeak = [] as string[];

    // add to the beginning of the scentences to speek the query and the title if it is a question
    if (story.personality !== 'passthrough') {
      if (story.isStory) {
        sentencesToSpeak.push(`SCENE: \n\n${story.query}`);
      } else {
        sentencesToSpeak.push(`SCENE: \n\n${story.query}`);
      }
      currentSceneText = story.query + "\n\n";
      sceneCount++;
      sceneTexts.push(currentSceneText);
      currentSceneText = "";
    } else {
      combinedSentences = [`SCENE\n\n${story.query}`];
    }

    let dotsStatus = ".";
    for (const sentence of combinedSentences) {
      // check if we need to change the scene
      const allowList = ['Title', 'Question', 'Answer', 'Begins', 'Plotline', 'Scene', 'SCENE', 'SCENE:', 'INT.'];

      if (currentSceneText.length > 500
        || allowList.some(word => sentence.includes(word))
        || (!sentence.startsWith('References: ')
          && sentence !== ''
          && (imageSource == 'pexels'
            || imageCount === 0
          )
        )) {
        // remove SCENE markers
        let cleanSentence = sentence.replace('SCENE:', '').replace('SCENE', '');

        // Scene change, store scene with text and image
        if (currentSceneText !== "") {
          if (story.isStory) {
            // generate this scenes image
            console.log(`#SCENE: ${sceneCount + 1} - Generating AI Image #${imageCount + 1}: ${currentSceneText.slice(0, 20)}`);
            setLoadingOSD(`Scene: ${sceneCount + 1} - Generating Image #${imageCount + 1} [${currentSceneText.slice(0, 10)}...]`);
            let promptImage = `a picture for the ${story.isStory ? "episode title" : "message"}: ${story.title} for the current scene: ${currentSceneText}`;

            const imgGenResult = await generateAIimage(promptImage, `${historyPrimer}\n`, '', imageCount);
            if (imgGenResult.image !== '') {
              lastImage = imgGenResult.image;
              imageCount++;
              promptImages.push(lastImage);
              if (imgGenResult.prompt != '') {
                promptImageText = imgGenResult.prompt;
                promptImageTexts.push(promptImageText);
                if (debug) {
                  console.log(`promptImageText: ${promptImageText}`);
                }
              }
            }
          } else {
            console.log(`Generating Scene ${sceneCount + 1}: ${currentSceneText.slice(0, 20)}`);
          }

          // add the current scene to the list of scenes
          sceneTexts.push(`${currentSceneText.replace('SCENE:', '').replace('SCENE', '')}`);
          sceneCount++;
        }
        // Next scene setup and increment scene counter
        currentSceneText = cleanSentence;
        sentencesToSpeak.push(`SCENE: ${cleanSentence}`);
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
    if (sceneTexts.length === 0 && imageCount === 0) {
      if (story.isStory) {
        console.log(`Generating AI Image #${imageCount + 1} for Scene ${sceneCount + 1}: ${currentSceneText.slice(0, 20)}`);
        setLoadingOSD(`Scene: ${sceneCount + 1} - Generating Image #${imageCount + 1} [${currentSceneText.slice(0, 10)}...]`);
        let promptImage = `a picture for the ${story.isStory ? "episode title" : "message"}: ${story.title} for the current scene: ${currentSceneText}`;
        if (!story.isStory) {
          promptImage =
            "Portrait shot of the personality: "
            + buildPrompt(story.personality as keyof typeof PERSONALITY_PROMPTS, false).slice(0, 2000)
            + "\n\n Response: " + `${story.title}:\n ${currentSceneText}`;
        }
        const imgGenResult = await generateAIimage(promptImage, `${historyPrimer}\n`, '', imageCount);
        if (imgGenResult.image !== '') {
          lastImage = imgGenResult.image;
          imageCount++;
          promptImages.push(lastImage);
          if (imgGenResult.prompt != '') {
            promptImageText = imgGenResult.prompt;
            promptImageTexts.push(promptImageText);
            if (debug) {
              console.log(`promptImageText: ${promptImageText}`);
            }
          }
        }
      } else {
        console.log(`Generating Scene ${sceneCount + 1}: ${currentSceneText.slice(0, 20)}`);
      }

      // add the current scene to the list of scenes
      sceneTexts.push(`SCENE: ${sentences.join(' ').replace('SCENE:', '').replace('SCENE', '')}`);
      sentencesToSpeak.push(`SCENE: ${sentences.join(' ').replace('SCENE:', '').replace('SCENE', '')}`);
      sceneCount++;
    } else if (sceneTexts.length === 0) {
      console.log(`No scenes found in the message: ${message.slice(0, 20)}`);
      sceneTexts.push(`SCENE: ${sentences.join(' ').replace('SCENE:', '').replace('SCENE', '')}`);
      sentencesToSpeak.push(`SCENE: ${sentences.join(' ').replace('SCENE:', '').replace('SCENE', '')}`);
      sceneCount++;
    }
    setLoadingOSD(`Generated #${imageCount} images #${sentences.length} sentences #${sceneTexts.length} scenes.`);

    // keep track of scene and images positions
    let sceneIndex = 0;
    let imagesIndex = 0;

    // Fill the story object
    story.title = titleScreenText;
    story.imageUrl = titleScreenImage;
    story.imagePrompt = promptImageEpisodeText.replace(/^\"/, '').replace(/\"$/, '');

    let scene: Scene | null = null;
    let sentenceId = 0;

    // Create Audio MP3s for each sentence
    for (let sentence of sentencesToSpeak) {
      // SCENE Change, new image and different speaker or story section
      if (sentence.startsWith('SCENE: ')) {
        // If there is a previous scene, add it to the story
        if (scene) {
          story.scenes.push(scene);
        }

        sentence = sentence.replace('SCENE: ', '');
        lastImage = promptImages[imagesIndex];

        // Start a new scene
        scene = {
          id: sceneIndex,
          sentences: [],
          imageUrl: promptImages[imagesIndex],
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

      if (debug) {
        console.log(`Using voice model: ${model} for ${currentSpeaker} - ${detectedGender} in ${audioLanguage} language`);
      }

      // If the speaker has changed or if it's a scene change, switch back to the default voice
      if (!speakerChanged && (sentence.startsWith('*') || sentence.startsWith('-'))) {
        detectedGender = gender;
        currentSpeaker = 'groovy';
        model = defaultModel;
        console.log(`Switched back to default voice. Gender: ${detectedGender}, Model: ${model}`);
        isSceneChange = true;  // Reset the scene change flag
      }

      // If the sentence starts with a parenthetical action or emotion, the speaker is continuing to speak
      if (sentence.startsWith('(') || (!sentence.startsWith('*') && !speakerChanged && !isSceneChange)) {
        isContinuingToSpeak = true;
      }

      // audio file for text to speech into MP3
      let audioFile: string = '';

      // text subtitle cleaning of special symbols and translation
      let cleanText: string = '';
      let translationEntry: string = '';
      let translatedText = '';

      // Set the subtitle to the translated text if the text is not in English
      if (subtitleLanguage !== 'en-US' && translateText) {
        translatedText = await fetchTranslation(sentence, subtitleLanguage);

        // Speak the translated text
        if (translatedText !== '' && audioLanguage == subtitleLanguage && translateText) {
          // Use the previously translated text
          translationEntry = translatedText;
        } else {
          // Translate the text
          translationEntry = await fetchTranslation(sentence, audioLanguage);
        }
        cleanText = removeMarkdownAndSpecialSymbols(translationEntry);
      } else {
        cleanText = removeMarkdownAndSpecialSymbols(sentence);
      }

      // Log empty sentences
      if (cleanText === '') {
        console.log(`Skipping empty sentence after cleaning: ${sentence}`);
      }

      if (debug) {
        console.log('Speaking as - ', detectedGender, '/', model, '/', audioLanguage, ' - Original Text: ', sentence, "\n Translation Text: ", cleanText);
      }
      try {
        if (cleanText != '') {
          setLoadingOSD(`TextToSpeech #${sentenceId} of #${sentencesToSpeak.length} - ${detectedGender}/${model}/${audioLanguage}`);

          // Try to run speakText to create the audio file
          let attempts = 0;
          audioFile = '';
          while (audioFile === '') {
            attempts += 1;

            // If there are too many attempts, skip this audio file
            if (attempts > 3) {
              console.log(`Too many attempts to create audio file ${audioFile}. Skipping...`);
              break;
            } if (attempts > 1) {
              // sleep for 1 second
              setTimeout(() => {
                if (debug) {
                  console.log('avoid any rate limits...');
                }
              }, 100);
            }
            try {
              let currentAudioLanguage = audioLanguage;
              let currentModel = model;
              const { language: detectedLanguage, model: detectedModel } = selectVoiceModel(cleanText, detectedGender);
              if (detectedModel !== '' && audioLanguage != detectedLanguage && !story.isStory) {
                currentModel = detectedModel;
                currentAudioLanguage = detectedLanguage;
              }

              audioFile = `audio/${story.id}/${sentenceId}.mp3`;
              const prosodyText = addProsody(story.personality, cleanText, voiceRate, voicePitch);
              await speakText(prosodyText, voiceRate, voicePitch, detectedGender, currentAudioLanguage, currentModel, audioFile);

              // Check if the audio file exists
              const response = await fetch(`https://storage.googleapis.com/${bucketName}/${audioFile}`, { method: 'HEAD' });
              if (!response.ok) {
                console.log(`File not found at ${audioFile}`);
                throw new Error(`File not found at ${audioFile}`);
              }
            } catch (e) {
              console.log(`Error speaking text on ${attempts} attempt or file not found: ${e}`);
              audioFile = '';  // Unset the audioFile variable
            }
          }
        }
      } catch (e) {
        console.log('Error speaking text: ', e);
      }

      // Update the last speaker
      lastSpeaker = currentSpeaker;

      // If there is a current scene, add the sentence to it
      if (scene && (cleanText !== '' || translationEntry !== '')) {
        scene.sentences.push({
          id: sentenceId++,
          text: translationEntry != '' ? translationEntry : sentence,
          imageUrl: lastImage,  // or another image related to the sentence
          speaker: currentSpeaker,  // or another speaker related to the sentence
          gender: detectedGender,  // or another gender related to the sentence
          language: audioLanguage,  // or another language related to the sentence
          model: model,  // or another model related to the sentence
          audioFile: audioFile != '' ? `https://storage.googleapis.com/${bucketName}/${audioFile}` : '',  // or another audio file related to the sentence
        });
      }
    }

    // If there is a last scene, add it to the story
    if (scene) {
      story.scenes.push(scene);
    }

    // share the story
    try {
      if (story.isStory) {
        // Share the story after building it before displaying it
        let shareUrl = await shareStory(story, isFetching);

        if (shareUrl != '' && !isPlaying) {
          setLoadingOSD(`Episode shared to: ${shareUrl}!`);
        }
      }
    } catch (error) {
      console.error(`Error sharing story: ${error}`);
    }

    return story;
  }

  // Recieve an episode request from the queue and generate the story then queue it for playback
  const submitQueueDisplay = async (localEpisode: Episode): Promise<Story> => {
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

      // Main Key we use for the story ID
      let localStoryId = uuidv4().replace(/-/g, '');

      // Set the personality
      const localPersonality: keyof typeof PERSONALITY_PROMPTS = localEpisode.personality as keyof typeof PERSONALITY_PROMPTS;

      // Override the imageUrl with ones from PERSONALITY_IMAGES if the personality is in the list
      let personalityImageUrl = '';
      if (PERSONALITY_IMAGES[localPersonality as keyof typeof PERSONALITY_IMAGES]) {
        personalityImageUrl = PERSONALITY_IMAGES[localPersonality as keyof typeof PERSONALITY_IMAGES];
        setPersonalityImageUrls((state) => ({ ...state, [localPersonality]: imageUrl }));
      }

      // Override the voiceModel with ones from PERSONALITY_VOICE_MODELS if the personality is in the list
      let voiceModel = '';
      let voiceRate = 1.0;
      let voicePitch = 0.0;
      let personalityGender: string = gender;
      if (localEpisode.type !== 'episode') {
        if (PERSONALITY_VOICE_MODELS[localPersonality as keyof typeof PERSONALITY_VOICE_MODELS]) {
          let personalityVoice = PERSONALITY_VOICE_MODELS[localPersonality as keyof typeof PERSONALITY_VOICE_MODELS];
          if (personalityVoice.model != '') {
            voiceModel = personalityVoice.model;
          }
          if (personalityVoice.rate != 1.0) {
            voiceRate = personalityVoice.rate;
          }
          if (personalityVoice.pitch != 0.0) {
            voicePitch = personalityVoice.pitch;
          }
          if (personalityVoice.gender != '') {
            personalityGender = personalityVoice.gender;
          }
        }
      }

      // setup the story structure
      let story: Story = {
        title: '',
        url: `https://storage.googleapis.com/${bucketName}/stories/${localStoryId}/data.json`,
        thumbnailUrls: [],
        id: localStoryId,
        UserId: localEpisode.username,
        prompt: localEpisode.prompt,
        tokens: tokens,
        scenes: [],
        imageUrl: personalityImageUrl,
        imagePrompt: '',
        timestamp: Date.now(),
        personality: localEpisode.personality,
        namespace: localEpisode.namespace,
        references: [],
        isStory: localEpisode.type === 'episode' ? true : false,
        shareUrl: `${baseUrl}/${localStoryId}`,
        rawText: '',
        query: localEpisode.title,
        documentCount: documentCount,
        episodeCount: episodeCount,
        gptModel: modelName,
        gptFastModel: fastModelName,
        gptPrompt: buildPrompt(localPersonality, localEpisode.type === 'episode' ? true : false),
        defaultGender: personalityGender,
        defaultVoiceModel: voiceModel,
        defaultVoiceRate: voiceRate,
        defaultVoicePitch: voicePitch,
        speakingLanguage: audioLanguage,
        subtitleLanguage: subtitleLanguage,
      }

      // Set current episode ID
      episodeIdRef.current = story.id;

      if (story.imageUrl != '') {
        setPersonalityImageUrls((state) => ({ ...state, [story.personality]: story.imageUrl }));
      } if (localEpisode.personality === 'passthrough') {
        // Passthrough image from  query
        let gaibImage = await generateImageUrl(story.query, true, '', localEpisode.personality, localStoryId);
        if (gaibImage !== '') {
          story.imageUrl = gaibImage;
        } else {
          story.imageUrl = await getGaib();
        }
      } else if (!personalityImageUrls[localEpisode.personality]) {
        let imageId = uuidv4().replace(/-/g, '');
        let gaibImage = await generateImageUrl("Portrait shot of the personality: " + buildPrompt(localEpisode.personality as keyof typeof PERSONALITY_PROMPTS, false).slice(0, 2000), true, '', localEpisode.personality, imageId);
        if (gaibImage !== '') {
          setPersonalityImageUrls((state) => ({ ...state, [localEpisode.personality]: gaibImage }));
        }
        story.imageUrl = gaibImage;
      }
      if (story.imageUrl && story.imageUrl !== '') {
        setImageUrl(story.imageUrl);
      }

      try {
        console.log(`SubmitQueue: Submitting Recieved ${localEpisode.type} #${episodes.length}: ${localEpisode.title}`);
        // create the titles and parts of an episode
        if (localEpisode.type == 'episode') {
          titleArray.push(localEpisode.title);

          // TODO: Add multiple story scenes and different characters interacting with each other
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
        setLoadingOSD(`Recieved ${localEpisode.type}: [${localEpisode.title.slice(0, 30).replace(/\n/g, ' ')}]`);
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
                    setLoadingOSD('ALERT: System Error!!! Please try again.');
                    ctrl.abort();
                    resolve();
                  } else {
                    const data = JSON.parse(event.data);
                    try {
                      if (data.sourceDocs) {
                        if (debug) {
                          console.log(`handleSubmit: Recieved ${data.sourceDocs.length} sourceDocs ${JSON.stringify(data.sourceDocs)}}`);
                        }
                        pendingSourceDocs = data.sourceDocs;
                      } else {
                        pendingMessage += data.data;
                      }
                    } catch (error) {
                      console.error('An error occurred in the handleSubmitQueue function:', error); // Check for any errors
                    }
                    if (data.data) {
                      tokens = tokens + countTokens(data.data);
                      setLoadingOSD(`${tokens} GPT tokens generated...`);
                    } else {
                      console.log(`handleSubmitQueue: No data returned from the server.`);
                      setLoadingOSD(`${countTokens(pendingMessage)} GPT tokens generated...`);
                    }
                  }
                },
              });
            } catch (error: any) {
              reject(error);
            }
          });
        };

        // check if we are set to use context retrieval or just the LLM model
        if (useContextRetrieval) {
          await fetchData();
        } else {
          let content = await generateAImessage(localEpisode.title, story.gptPrompt, tokensCount);
          if (content) {
            tokens = tokens + countTokens(content);
            setLoadingOSD(`${tokens} GPT tokens generated...`);
          } else {
            console.log(`handleSubmitQueue: No data returned from the server.`);
            setLoadingOSD(`${countTokens(content)} GPT tokens generated...`);
          }
          pendingMessage = content;
          const newMessage: Message = {
            type: 'apiMessage',
            message: pendingMessage,
            sourceDocs: [],
          };
          newMessages = [...newMessages, newMessage];
          setMessageState((state) => ({
            history: [],
            messages: newMessages,
            sourceDocs: [],
            pending: undefined,
            pendingSourceDocs: undefined,
          }));
        }
      } catch (error) {
        console.error('An error occurred in the handleSubmitQueue function:', error); // Check for any errors
        if (localEpisode) {
          episodes.unshift(localEpisode); // Put the episode back in the queue
        }
      }

      if (debug) {
        console.log(`storyQueue: messages length ${newMessages.length} contain\n${JSON.stringify(newMessages, null, 2)}`)
      }

      function sanitizeString(str: string): string {
        return str.replace(/[.#$\/\[\]]/g, '_');
      }

      function sanitizeKeysAndValues(obj: any): any {
        if (typeof obj !== 'object' || obj === null) return obj;

        return Object.keys(obj).reduce((acc: Record<string, any>, key: string) => {
          const sanitizedKey = sanitizeString(key);
          const value = obj[key];
          acc[sanitizedKey] = typeof value === 'string'
            ? sanitizeString(value)
            : Array.isArray(value)
              ? value.map(sanitizeKeysAndValues)
              : sanitizeKeysAndValues(value);
          return acc;
        }, Array.isArray(obj) ? [] : {});
      }

      // collect the story raw text and references 
      story.rawText = pendingMessage;
      story.references = sanitizeKeysAndValues(pendingSourceDocs);
      story.tokens = tokens;

      try {
        const processedStory = await processImagesAndSubtitles(story);
        return processedStory;  // Return the processed Story
      } catch (error) {
        console.error(`processImagesAndSubtitles: Error displaying images and subtitles for story ${story.id} ${story.title}: ${error}`);
        throw error;  // Propagate the error
      }
    } else {
      return Promise.reject(new Error("No localEpisode provided"));
    }
  };

  useEffect(() => {
    const intervalId = setInterval(async () => {  // Set up the interval
      if (episodes.length > 0 && !isSubmitQueueRef.current && playQueue.length < 1) {
        isSubmitQueueRef.current = true;
        if (debug) {
          console.log(`submitQueueDisplay: ${episodes.length} episodes queued, submitting one...`);
        }
        let localEpisode: Episode = episodes.shift() as Episode;
        if (localEpisode) {
          localEpisode = parseQuestion(localEpisode);
          try {
            const story = await submitQueueDisplay(localEpisode);  // Use await here
            if (story) {
              if (debug) {
                console.log(`submitQueueDisplay: ${story.isStory ? 'Story' : 'Question'} #${story.id} ${story.title} submitted. ${JSON.stringify(story)}`)
              }
              // Add the story to the playQueue
              addToQueue(story);
              console.log(`submitQueueDisplay: ${episodes.length} episodes left in queue.`);
            } else {
              console.log(`submitQueueDisplay: No story returned`);
            }
          } catch (error) {
            console.error(`submitQueueDisplay: Error submitting queue: ${error}`);
            if (!twitchChatEnabled) {
              alert(`submitQueueDisplay: Error submitting queue: ${error}`);
            } else if (channelId !== '' && twitchChatEnabled && user?.uid !== '') {
              postResponse(channelId, `Sorry, I failed a submitting the queue, please try again.`, user?.uid);
            }
          }
        } else {
          console.log(`submitQueueDisplay: No localEpisode found`);
        }
        isSubmitQueueRef.current = false;
      }
    }, 1000);  // Run every 1 second

    return () => clearInterval(intervalId);  // Clear the interval when the component unmounts
  }, [episodes]);

  // take an Episode and parse the question and return the Episode with the parts filled out from the question
  function parseQuestion(episode: Episode): Episode {
    let localEpisode = episode;
    let localIsStory = localEpisode.type ? localEpisode.type == 'episode' ? true : false : isStory;
    let localNamespace = localEpisode.namespace ? localEpisode.namespace : selectedNamespace;
    let localPersonality = localEpisode.personality ? localEpisode.personality : selectedPersonality;
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
            localEpisode.personality = 'buddha' as keyof typeof PERSONALITY_PROMPTS;
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
          if (!stopWordDetected.current && !isPlaying && startWordDetected.current) {
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
        } else if (!stoppedManually && !isPlaying && !timeoutDetected.current) {
          startSpeechRecognition();
        } else {
          console.error(`recognition.onerror: Error occurred in recognition: ${event.error}, stoppedManually: ${stoppedManually}, isPlaying: ${isPlaying}, timeoutDetected: ${timeoutDetected.current}`);
        }
      };
    } else {
      console.log('Speech Recognition API is not supported in this browser.');
    }
  }, [listening, stoppedManually, recognition, setListening, setVoiceQuery, setSpeechRecognitionComplete, timeoutDetected, startWordDetected, stopWordDetected, setTimeoutID, isPlaying, voiceQuery]);

  // Add a useEffect hook to call handleSubmit whenever the query state changes
  useEffect(() => {
    if (voiceQuery && speechRecognitionComplete && timeoutDetected.current && !stopWordDetected.current && !isPlaying) {
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
  }, [voiceQuery, speechRecognitionComplete, isPlaying, stoppedManually, isStory, episodes, startSpeechRecognition, selectedNamespace, selectedPersonality]);

  // Add a useEffect hook to start the speech recognition when the component mounts
  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      if (!listening && !isPlaying && !stoppedManually && !voiceQuery) {
        console.log(`useEffect: Starting speech recognition, stoppedManually: ${stoppedManually}`);
        startSpeechRecognition();
      }
    }
  }, [listening, isPlaying, voiceQuery, stoppedManually, startSpeechRecognition]);

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
    if (!latestMessage.message || latestMessage.message === '') {
      console.log(`Replay is skipping empty message: ${JSON.stringify(latestMessage, null, 2)}`);
      alert(`Replay is skipping empty message.`);
      return;
    }
    let episode: Episode = {
      title: `${latestMessage.message}`,
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
    // If using Web Speech API, stop it first.
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }

    // Reset state variables.
    if (isPaused) {
      setIsPaused(false);
      resumeSpeaking();
    }
  };

  const handlePause = () => {
    if (isPaused) {
      resumeSpeaking();
      setIsPaused(false);
    } else {
      setIsPaused(true);
      pauseSpeaking();
    }
  };

  // toggle the full screen state
  const toggleFullScreen = () => {
    const imageContainer = document.querySelector(`.${styles.imageContainer}`);
    //const image = document.querySelector(`.${styles.generatedImage} img`);

    if (!document.fullscreenElement) {
      if (imageContainer?.requestFullscreen) {
        imageContainer.requestFullscreen();
        //image?.classList.add(styles.fullScreenImage);
        setIsFullScreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        //image?.classList.remove(styles.fullScreenImage);
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
        <title>${selectedPersonality}</title>
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
                  zIndex: isFullScreen ? 1000 : 1,
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
                    {(imageUrl === '') ?
                      <div style={{ width: "600px", height: "600px" }}>
                        <img src={defaultGaib} alt="Groovy" />
                      </div>
                      : (
                        <>
                          <div ref={faceContainerRef} style={{ position: 'relative', width: '100vh', height: '100%' }}></div>
                        </>
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
                      onClick={handleSpeechToggle}
                      type="button"

                    >
                      {!stoppedManually ? 'Voice Input Off' : 'Voice Input On'}
                    </button>&nbsp;&nbsp;&nbsp;&nbsp;
                    {(isPlaying) ? (
                      <>
                        <button
                          title="Stop Speaking"
                          onClick={handleStop}
                          type="button"
                          className={`${styles.footer} ${(isPlaying) ? styles.listening : ''}`}
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
                    {(isPlaying) && isPaused ? (
                      <>
                        <button
                          title="Resume"
                          onClick={handlePause}
                          type="button"
                          className={`${styles.footer} ${isPlaying ? styles.listening : ''}`}
                        >Resume Play</button> &nbsp;&nbsp;&nbsp;&nbsp;
                      </>
                    ) : (isPlaying) && !isPaused ? (
                      <>
                        <button
                          title="Pause"
                          onClick={handlePause}
                          type="button"
                          className={`${styles.footer}`}
                        >Pause</button> &nbsp;&nbsp;&nbsp;&nbsp;</>
                    ) : (<></>)}
                    <button
                      title="Clear History"
                      onClick={handleClear}
                      type="button"
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
                          (isPlaying)
                            ? isStory
                              ? `Writing your story...`
                              : `Answering your question...`
                            : isStory
                              ? `[${selectedPersonality}/${selectedNamespace} ${gender} ${audioLanguage}/${subtitleLanguage} (${documentCount} docs) X ${episodeCount} episodes]\nSay "Hey Buddha...Plotline" for a story, say "Stop Buddha" to cancel. You can also type it here then press the Enter key.`
                              : `[${selectedPersonality}/${selectedNamespace} ${gender} ${audioLanguage}/${subtitleLanguage} (${documentCount} docs) X ${episodeCount} answers]\nSay "Hey Buddha...Question" for an answer, say "Stop Buddha" to cancel. You can also type it here then press the Enter key.`
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
                      readOnly={isPlaying || (selectedPersonality == 'passthrough')}
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
                        readOnly={isPlaying || (selectedPersonality == 'passthrough')}
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
