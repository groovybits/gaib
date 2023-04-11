import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/layout';
import styles from '@/styles/Home.module.css';
import { Message } from '@/types/chat';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import LoadingDots from '@/components/ui/LoadingDots';
import { Document } from 'langchain/document';
import { useSpeakText } from '@/utils/speakText';
import { PERSONALITY_PROMPTS } from '../config/personalityPrompts';


type PendingMessage = {
  type: string;
  message: string;
  sourceDocs?: Document[];
};
type ChatMessage = Message | PendingMessage;

export default function Home() {
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
        message: '[GAIB] Groovy AI Bot: Nice to meet you!',
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
  const [listenForGAIB, setListenForGAIB] = useState<boolean>(true);
  const [timeoutID, setTimeoutID] = useState<NodeJS.Timeout | null>(null);
  const [lastSpokenMessageIndex, setLastSpokenMessageIndex] = useState(-1);
  const [lastMessageDisplayed, setLastMessageDisplayed] = useState(-1);

  const messageListRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [subtitle, setSubtitle] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('gaib_c.png');


  const togglePopup = () => {
    setShowPopup(!showPopup);
  };

  async function fetchGptGeneratedImageUrl(sentence: string, index: number): Promise<string> {
    const keywords = encodeURIComponent(sentence);
    const gaibOpen = `gaib_o.png?${keywords}`;
    const gaibClosed = `gaib_c.png?${keywords}`;
  
    const selectedImage = index % 2 === 0 ? gaibOpen : gaibClosed;
    return selectedImage;
  }
  
  function splitSentence(sentence : any, maxLength = 80) {
    const regex = new RegExp(`(.{1,${maxLength}})(\\s+|$)`, 'g');
    try {
      return sentence.match(regex) || [];
    } catch (e) {
      console.log('Error splitting sentence: ', sentence, ': ', e);
      return [sentence];
    }
  }  
  
  useEffect(() => {
    const lastMessageIndex : any = messages.length - 1;

    async function displayImagesAndSubtitles() {
      let sentences : string[];
      try {
        // Split the message into sentences
        sentences = messages[lastMessageIndex].message.split(/(?<=\.|\?|!)\s+/);
      } catch (e) {
        console.log('Error splitting sentences: ', messages[lastMessageIndex].message, ': ', e);
        sentences = [messages[lastMessageIndex].message];
      }
  
      for (const sentence of sentences) {
        // TODO: Generate an image based on the sentence
        //const generatedImageUrl = await fetchGptGeneratedImageUrl(sentence, lastMessageIndex);

        // Set the subtitle and wait for the speech to complete before proceeding to the next sentence
        if (lastMessageDisplayed != lastMessageIndex) {
          // Reset the subtitle
          setImageUrl('gaib_o.png'); // Set the image to the open mouth
          setSubtitle('');
          // Set the subtitle
          setSubtitle(splitSentence(sentence));
          console.log('Speech starting for sentence: ', sentence, 'at ', new Date().toLocaleTimeString('en-US'));
          // Speak the sentence
          await speakText(sentence, 1, 'FEMALE', 'en-US', 'en-US-Neural2-H');
          console.log('Speech complete for sentence: ', sentence, 'at ', new Date().toLocaleTimeString('en-US'));
          setImageUrl('gaib_c.png'); // Set the image to the closed mouth
          // Set the last message displayed
          setLastMessageDisplayed(lastMessageIndex);
        }
      }
      // Reset the subtitle after all sentences have been spoken
      setSubtitle('');
      setImageUrl('gaib_c.png');
    }
  
    if (
      speechOutputEnabled &&
      lastMessageIndex > lastSpokenMessageIndex &&
      messages[lastMessageIndex].type === 'apiMessage'
    ) {
      displayImagesAndSubtitles();
      setLastSpokenMessageIndex(lastMessageIndex);
    } else {
      stopSpeaking();
    }
  }, [messages, speechOutputEnabled, speakText, stopSpeaking, lastSpokenMessageIndex, imageUrl, setSubtitle, fetchGptGeneratedImageUrl, lastMessageDisplayed]);
  

  type SpeechRecognition = typeof window.SpeechRecognition;

  const handleSpeechOutputToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSpeechOutputEnabled(event.target.checked);
  };

  // Modify the handleSubmit function
  async function handleSubmit(e: any, personality: keyof typeof PERSONALITY_PROMPTS = 'GAIB', recognitionInstance?: SpeechRecognition) {
    e.preventDefault();

    setError(null);

    if (listening) {
      setStoppedManually(true);
      if (recognitionInstance) {
        recognitionInstance.stop();
      }
      return;
    }

    if (timeoutID) {
      clearTimeout(timeoutID);
      setTimeoutID(null);
    }

    // Return early if speechRecognitionComplete is false
    if (!speechRecognitionComplete) {
      return;
    }

    if (!query) {
      console.log('[GAIB] Prompt Query submission was empty!');
      return;
    }

    const question = query.trim();

    setMessageState((state) => ({
      ...state,
      messages: [
        ...state.messages,
        {
          type: 'userMessage',
          personality,
          message: question,
        },
      ],
      pending: undefined,
    }));

    setLoading(true);
    setQuery('');
    setMessageState((state) => ({ ...state, pending: '' }));

    const ctrl = new AbortController();

    try {
      fetchEventSource('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          personality,
          history,
        }),
        signal: ctrl.signal,
        onmessage: (event) => {
          if (event.data === '[DONE]') {
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
      console.log('error', error);
    }
  }

  const handleEnter = useCallback(
    (e: any) => {
      if (e.key === 'Enter' && !e.shiftKey && query) {
        handleSubmit(e);
      } else if (e.key == 'Enter') {
        e.preventDefault();
      }
    },
    [query],
  );

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

  const latestMessage: Message | PendingMessage | undefined = chatMessages[chatMessages.length - 1];
  const [animeCharacterText, setAnimeCharacterText] = useState(latestMessage?.message ?? '');

  //scroll to bottom of chat
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [chatMessages]);

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

      if (listening) {
        setStoppedManually(false);
        recognition.stop();
      } else {
        setSpeechRecognitionComplete(false);
        recognition.start();
      }

      recognition.onstart = () => {
        setListening(true);
      };

      recognition.onend = () => {
        setListening(false);
        setSpeechRecognitionComplete(true);

        if (!stoppedManually) {
          handleSubmit({ preventDefault: () => { } }, recognition);
        }
      };

      recognition.onresult = (event: { results: string | any[]; }) => {
        let last = event.results.length - 1;
        let text = event.results[last][0].transcript;
        let transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();

        setQuery(text); // Set the query to the new text

        if (listenForGAIB && (transcript.includes("gabe") || transcript.includes("game"))) {
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

  // Add a new function to handle the GAIB listening toggle
  const handleGAIBListeningToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    setListenForGAIB(event.target.checked);
  };

  return (
    <>
      <Layout>
        <div className="mx-auto flex flex-col gap-4 bg-#3b82f6">
          <main className={styles.main}>
            <div className={styles.cloud}>
              <div className={styles.imageContainer}>
                <img src={imageUrl} alt="GAIB" className={styles.generatedImage} height="480" width="720" />
                <div className={styles.subtitle}>{subtitle}</div>
              </div>
            </div>
            <div className={styles.center}>
              <div className={styles.cloudform}>
                <form onSubmit={handleSubmit}>
                  <textarea
                    disabled={loading}
                    onKeyDown={handleEnter}
                    ref={textAreaRef}
                    autoFocus={true}
                    rows={3}
                    maxLength={600}
                    id="userInput"
                    name="userInput"
                    placeholder={
                      loading
                        ? 'GAIB is generating your Anime...'
                        : '[GAIB] Give me an Anime plotline to generate? Please end all spoken commands with \"GAIB\"'
                    }
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className={styles.textarea}
                  />
                  <div className={styles.buttonWrapper}>
                    <div className={styles.buttoncontainer}>
                      <button
                        type="submit"
                        disabled={loading}
                        className={styles.generatebutton}
                      >
                        {loading ? (
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
                    </div>
                    <div className={styles.buttoncontainer}>
                      <button
                        type="button"
                        disabled={loading}
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
                    </div>
                    <div className={styles.buttoncontainer}>
                      <button
                        type="button"
                        className={styles.stopvoicebutton}
                        onClick={stopSpeaking}
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
                    </div>
                    <div className={styles.buttoncontainer}>
                      {Object.keys(PERSONALITY_PROMPTS).map((key) => (
                        <button
                          type="submit"
                          key={key}
                          onClick={(e) => {
                            e.preventDefault();
                            handleSubmit(e, key as keyof typeof PERSONALITY_PROMPTS);
                          }}
                          className={styles.personalityButton}
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.buttonWrapper}>
                    <div className={styles.buttoncontainer}>
                  <label>
                    <input
                      type="checkbox"
                      checked={speechOutputEnabled}
                      onChange={handleSpeechOutputToggle}
                    />
                    &nbsp;&nbsp; <b>Enable speech output</b> &nbsp;&nbsp;
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={listenForGAIB}
                      onChange={handleGAIBListeningToggle}
                    />
                    &nbsp;&nbsp; <b>Listen for GAIB</b>
                  </label>
                    </div>
                  </div>
                  <div className={styles.buttonContainer}>
                    <button onClick={togglePopup} className={styles.copyButton}>
                      <svg
                        className={styles.documentIcon}
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M19 3H9C7.89543 3 7 3.89543 7 5V19C7 20.1046 7.89543 21 9 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3ZM17 19H11V17H17V19ZM17 15H11V13H17V15ZM17 11H11V9H17V11ZM17 7H11V5H17V7Z"
                          fill="currentColor"
                        />
                      </svg>
                      Transcript View
                    </button>

                    {showPopup && (
                      <div className="popup" onClick={togglePopup}>
                        <div
                          className="popup-content"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <pre className={styles.preWrap}>{latestMessage.message}</pre>
                        </div>
                      </div>
                    )}
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
