import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/layout';
import styles from '@/styles/Home.module.css';
import { Message } from '@/types/chat';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { Document } from 'langchain/document';
import { useSpeakText } from '@/utils/speakText';
import { PERSONALITY_PROMPTS } from '../config/personalityPrompts';
import { AnimeCharacter } from '@/components/animeCharacter';

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
        message: "Hi I am GAIB The Groovy AI Bot.\nYou can use the blue microphone button to ask me questions.",
        type: 'apiMessage',
      },
    ],
    history: [],
    pendingSourceDocs: [],
  });

  const { messages, pending, history, pendingSourceDocs } = messageState;
  const { stopSpeaking } = useSpeakText();

  const [listening, setListening] = useState<boolean>(false);
  const [stoppedManually, setStoppedManually] = useState<boolean>(false);
  const [speechRecognitionComplete, setSpeechRecognitionComplete] = useState(true);
  const [timeoutID, setTimeoutID] = useState<NodeJS.Timeout | null>(null);
  const [lastSpokenMessageIndex, setLastSpokenMessageIndex] = useState(-1);
  
  const messageListRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [showPopup, setShowPopup] = useState(false);

  const togglePopup = () => {
    setShowPopup(!showPopup);
  };

  type SpeechRecognition = typeof window.SpeechRecognition;

  // Modify the handleSubmit function
  async function handleSubmit(e: any, personality: keyof typeof PERSONALITY_PROMPTS = 'GAIB', recognitionInstance?: SpeechRecognition) {
    e.preventDefault();

    setError(null);

    if (listening) {
      setStoppedManually(true);
      if (recognitionInstance) {
        recognitionInstance.stop();
      }
      //return;
    }

    if (timeoutID) {
      clearTimeout(timeoutID);
      setTimeoutID(null);
    }

    // Return early if speechRecognitionComplete is false
    /*if (!speechRecognitionComplete) {
      return;
    }*/

    if (!query) {
      console.log('Warning: Prompt Query submission was empty!');
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
      if (e.key === 'Enter' && !e.shiftKey && query && speechRecognitionComplete) {
        handleSubmit(e);
      } else if (e.key == 'Enter') {
        e.preventDefault();
      }
    },
    [query, speechRecognitionComplete],
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
    if (latestMessage) {
      const lastMessageIndex = messages.length - 1;

      if (animeCharacterText !== latestMessage?.message) {
        setAnimeCharacterText(latestMessage?.message ?? '');
      }

      if (latestMessage.message.length > 0 &&
        lastMessageIndex > lastSpokenMessageIndex &&
        messages[lastMessageIndex].type === 'apiMessage'
      ) {
        setLastSpokenMessageIndex(lastMessageIndex);
        setAnimeCharacterText(latestMessage.message);
        console.log("latestMessage for Anime Character: ", latestMessage.message)
      }
    }
  }, [chatMessages, latestMessage, messages, lastSpokenMessageIndex, animeCharacterText]);

  const startSpeechRecognition = () => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;

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
      };

      recognition.onresult = (event: { results: string | any[]; }) => {
        let last = event.results.length - 1;
        let text = event.results[last][0].transcript;
        let transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();

        setQuery(text); // Set the query to the new text

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
          }, 3000); // Timeout after 3 seconds of no more speaking
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

  const gaibIsSpeaking = () => {
    if (chatMessages.length > 0) {
      const lastMessage = chatMessages[chatMessages.length - 1];
      if (lastMessage.type === 'apiMessage') {
        return (chatMessages.length - 1) === lastSpokenMessageIndex;
      }
    }
    return false;
  };
  
  return (
    <>
      <Layout>
        <div className="mx-auto flex flex-col gap-4">
          <main className={styles.main}>
            <div className={styles.cloud}>
            {latestMessage && (
              <div className={styles.markdownanswer}>
                {latestMessage.type === "apiMessage" ? (
                  <AnimeCharacter
                    text={latestMessage.message}
                    speaking={gaibIsSpeaking()}
                  />
                ) : (
                  <AnimeCharacter
                    text={latestMessage.message}
                    speaking={false}
                  />
                )}
              </div>
              )}
            </div>
            <div className={styles.center}>
              <div className={styles.cloudform}>
                <form onSubmit={handleSubmit}>
                  <textarea
                    disabled={loading}
                    onKeyDown={handleEnter}
                    ref={textAreaRef}
                    autoFocus={true}
                    rows={2}
                    maxLength={200}
                    id="userInput"
                    name="userInput"
                    placeholder={
                      loading
                        ? 'GAIB is generating your Anime...'
                        : 'Give me an Anime plotline to generate...'
                    }
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className={styles.textarea}
                  />
                  <div className={styles.buttonWrapper}>
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
                      <button onClick={togglePopup} className={styles.copybutton}>View Raw Transcript</button>

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
