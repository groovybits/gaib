import { useRef } from 'react';

export const useSpeakText = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const speakText = async (
    text: string,
    rate: number = 1,
    ssmlGender: string = 'FEMALE',
    languageCode: string = 'en-US',
    name: string = ''
  ): Promise<void> => {
    return new Promise(async (resolve) => {
      try {
        if (audioRef.current && !audioRef.current.paused) {
          console.log('Audio is already playing');
          resolve();
          throw new Error('Audio is already playing');
        }

        let apiBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        if (!apiBaseUrl || apiBaseUrl === '') {
          apiBaseUrl = 'http://127.0.0.1:3000';
        }

        if (typeof window === 'undefined') {
          console.log('Audio playback is not available in this environment');
          resolve();
          throw new Error('Audio playback is not available in this environment');
        }

        let response = null;
        if (name === '') {
          response = await fetch(`${apiBaseUrl}/api/synthesizeSpeech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, rate, ssmlGender, languageCode }),
          });
        } else {
          response = await fetch(`${apiBaseUrl}/api/synthesizeSpeech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, rate, ssmlGender, languageCode, name }),
          });
        }

        if (!response.ok) {
          throw new Error('Error in synthesizing speech, statusText: ' + response.statusText);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.play();
        audio.addEventListener(
          'ended',
          () => {
            stopSpeaking();
            URL.revokeObjectURL(audioUrl);
            resolve();
          },
          false
        );
      } catch (error) {
        console.error('Error in synthesizing speech, error:', error);
        resolve();
        throw error;
      }
    });
  };

  return { speakText, stopSpeaking };
};
