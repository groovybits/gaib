import { useRef } from 'react';
import firebase from 'firebase/app';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

export const useSpeakText: any = () => {
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
    name: string = '',
    audioFile: string = ''
  ): Promise<void> => {
    return new Promise(async (resolve) => {
      try {
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
          //console.log(`Synthesizing speech ${ssmlGender} ${languageCode} for text: ${text}`);
          response = await fetchWithAuth(`${apiBaseUrl}/api/synthesizeSpeech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify({ text, rate, ssmlGender, languageCode }),
          });
        } else {
          //console.log(`Synthesizing speech ${ssmlGender} ${name} ${languageCode} for text: ${text}`);
          response = await fetchWithAuth(`${apiBaseUrl}/api/synthesizeSpeech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify({ text, rate, ssmlGender, languageCode, name, audioFile }),
          });
        }

        if (!response.ok) {
          throw new Error('Error in synthesizing speech, statusText: ' + response.statusText);
        }

        // If we are saving to a file, we don't need to play the audio
        if (audioFile !== '') {
          resolve();
          return;
        }

        const audioBlob = await response.blob();

        // Playback the audio using the browser's built-in capabilities.
        const audioUrl = URL.createObjectURL(audioBlob);
        
        await speakAudioUrl(audioUrl);
        resolve();
      } catch (error) {
        console.error('Error in synthesizing speech, error:', error);
        resolve();
        throw error;
      }
    });
  };

  // Playback only from an audio url
  const speakAudioUrl = async (audioUrl: string): Promise<void> => {
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

        // Playback the audio using the browser's built-in capabilities.
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.play();
        audio.addEventListener(
          'ended',
          () => {
            stopSpeaking();
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

  return { speakText, stopSpeaking, speakAudioUrl };
};
