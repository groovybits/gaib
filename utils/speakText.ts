import { useState, useRef } from 'react';

export const useSpeakText = () => {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const queue = useRef<string[]>([]);
  const stopFlag = useRef<boolean>(false);

  const playNextInQueue = async () => {
    if (queue.current.length === 0 || stopFlag.current) {
      stopFlag.current = false;
      return;
    }

    const text = queue.current.shift() as string;

    try {
      const response = await fetch('/api/synthesizeSpeech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, rate: 1, ssmlGender: 'FEMALE',  languageCode: 'en-US', name: ''  }),
      });

      if (!response.ok) {
        throw new Error('Error in synthesizing speech');
      }
  
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();
    } catch (error) {
      console.error('Error in synthesizing speech:', error);
    }
  };

  const speakText = async (text: string, rate: number = 1, ssmlGender: string = 'FEMALE', languageCode: string = 'en-US', name: string = '') => {
    queue.current.push(text);

    if (!audio) {
      playNextInQueue();
    }
  };

  const stopSpeaking = () => {
    stopFlag.current = true;
    if (audio) {
      //audio.pause();
      //setAudio(null);
    }
  };

  return { speakText, stopSpeaking };
};