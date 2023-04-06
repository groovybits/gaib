import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/layout';
import styles from '@/styles/Home.module.css';
import { Message } from '@/types/chat';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import LoadingDots from '@/components/ui/LoadingDots';
import { Document } from 'langchain/document';
import { speakText } from '@/utils/speakText';


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
  const [speechRecognitionComplete, setSpeechRecognitionComplete] = useState(false);
  const [recognitionComplete, setRecognitionComplete] = useState(false);


  const messageListRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textAreaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].type === 'apiMessage') {
      speakText(messages[messages.length - 1].message, 0.8);
    }
  }, [messages]);

  type SpeechRecognition = typeof window.SpeechRecognition;

  // Modify the handleSubmit function
  async function handleSubmit(e: any, recognitionInstance?: SpeechRecognition) {
    e.preventDefault();

    setError(null);

    if (listening && recognitionInstance) {
      setStoppedManually(true);
      recognitionInstance.stop();
      return;
    }

    // Return early if recognitionComplete is false
    if (!recognitionComplete) {
      return;
    }

    // Return early if speechRecognitionComplete is false
    if (!speechRecognitionComplete) {
      return;
    }

    if (!query) {
      //alert('[GAIB] Specify an Anime plotline to generate!');
      console.log('[GAIB] Specify an Anime plotline to generate!');
      return;
    }

    const question = query.trim();

    setMessageState((state) => ({
      ...state,
      messages: [
        ...state.messages,
        {
          type: 'userMessage',
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

  //scroll to bottom of chat
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [chatMessages]);

  async function copyToClipboard(message: string) {
    try {
      await navigator.clipboard.writeText(message);
      console.log('Text copied to clipboard');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }

  const [listening, setListening] = useState<boolean>(false);
  const [stoppedManually, setStoppedManually] = useState<boolean>(false);

  const startSpeechRecognition = () => {
    setStoppedManually(false);
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;
      recognition.timeout = 30000;
  
      // Add a delay before starting the recognition
      setTimeout(() => {
        recognition.start();
        setSpeechRecognitionComplete(true);
      }, 0);
  
      recognition.onstart = () => {
        setListening(true);
      };
  
      recognition.onend = () => {
        setListening(false);
        if (!stoppedManually) {
          handleSubmit({ preventDefault: () => { } }, recognition);
        }
      };

      function removeDuplicateWords(text: string): string {
        const words = text.split(" ");
        const dedupedWords: string[] = [];
      
        for (let i = 0; i < words.length; i++) {
          const currentWord = words[i];
          if (!dedupedWords.includes(currentWord)) {
            dedupedWords.push(currentWord);
          } else if (i < words.length - 1) {
            const nextWord = words[i + 1];
            if (`${currentWord} ${nextWord}` !== dedupedWords[dedupedWords.length - 1]) {
              dedupedWords.push(`${currentWord} ${nextWord}`);
            }
          }
        }
      
        return dedupedWords.join(" ");
      }
  
      recognition.onresult = (event: { results: string | any[]; }) => {
        let last = event.results.length - 1;
        let text = event.results[last][0].transcript;
        setQuery((prevQuery) => prevQuery + ' ' + text); // concatenate the new text with the old text
        text = setQuery(removeDuplicateWords(text)); // remove duplicate words
        setRecognitionComplete(true); // Update recognitionComplete state
      };
  
      recognition.onerror = (event: { error: any; }) => {
        console.error('Error occurred in recognition:', event.error);
      };
    } else {
      alert('Speech Recognition API is not supported in this browser.');
    }
  };  

  return (
    <>
      <Layout>
        <div className="mx-auto flex flex-col gap-4">
          <main className={styles.main}>
            <div className={styles.cloud}>
              <div ref={messageListRef} className={styles.messagelist}>
                {chatMessages.map((message, index) => {
                  let icon;
                  let className;
                  if (message.type === 'apiMessage') {
                    icon = (
                      <Image
                        src="/bot-image.png"
                        alt="GAIB"
                        width="60"
                        height="60"
                        className={styles.boticon}
                        priority
                      />
                    );
                    className = styles.apimessage;
                  } else {
                    icon = (
                      <Image
                        src="/usericon.png"
                        alt="Human"
                        width="60"
                        height="60"
                        className={styles.usericon}
                        priority
                      />
                    );
                    // The latest message sent by the user will be animated while waiting for a response
                    className =
                      loading && index === chatMessages.length - 1
                        ? styles.usermessagewaiting
                        : styles.usermessage;
                  }
                  return (
                    <>
                      <div key={`chatMessage-${index}`} className={className}>
                        {icon}
                        <div className={styles.markdownanswer}>
                          <ReactMarkdown linkTarget="_blank">
                            {message.message}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </>
                  );
                })}
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
                    maxLength={300}
                    id="userInput"
                    name="userInput"
                    placeholder={
                      loading
                        ? 'GAIB is generating your Anime...'
                        : '[GAIB] Give me an Anime plotline to generate?'
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
