import { useRef } from 'react';

export const useSpeakText: any = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
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

  return { stopSpeaking, speakAudioUrl };
};
