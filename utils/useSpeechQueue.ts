import { useCallback, useState, useEffect, useRef } from 'react';

export const useSpeechQueue = (
  speakText: (text: string, rate: number, ssmlGender: string, languageCode: string, name: string) => Promise<void>
) => {
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);

  const addToQueue = useCallback(
    (text: string) => {
      console.log('addToQueue: ', text)
      queueRef.current.push(text);
    },
    [queueRef]
  );

  useEffect(() => {
    const processQueue = async () => {
      if (queueRef.current.length === 0 || processingRef.current) return;

      processingRef.current = true;
      const currentText = queueRef.current.shift();

      if (currentText) {
        await speakText(currentText, 1, 'FEMALE', 'en-US', '');
      }

      processingRef.current = false;
      processQueue();
    };

    processQueue();
  }, [speakText]);

  return { addToQueue };
};
