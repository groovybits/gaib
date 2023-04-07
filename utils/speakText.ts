// Description: This file contains the function to speak text using the Google Text-to-Speech API
// 
// Import useRef from React
import { useRef } from 'react';

export const useSpeakText = () => {
  // Create a variable to store the Audio instance
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create a new stop function
  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const speakText = async (text: string, rate: number = 1) => {
    try {
      let apiBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      if (!apiBaseUrl || apiBaseUrl === '') {
        apiBaseUrl = 'http://127.0.0.1:3000';
      }
      if (typeof window === 'undefined') {
        console.log('Audio playback is not available in this environment');
        return;
      }
      const response = await fetch(`${apiBaseUrl}/api/synthesizeSpeech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, rate }),
      });

      if (!response.ok) {
        throw new Error('Error in synthesizing speech, statusText: ' + response.statusText);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.play();
    } catch (error) {
      console.error('Error in synthesizing speech, error:', error);
    }
  };

  return { speakText, stopSpeaking };
};
