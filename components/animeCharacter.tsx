import React, { useState, useEffect, useRef } from 'react';
import { useSpeakText } from '@/utils/speakText';
import { useSpeechQueue } from '@/utils/useSpeechQueue'; // Add this import

interface AnimeCharacterProps {
  text: string;
  speaking: boolean;
}

const parseMessage = (message: string) => {
  const lines = message.split('\n').filter((line) => line.trim() !== '');
  let currentSpeaker = '';

  const parsedLines = lines.map((line) => {
    const [potentialName, ...rest] = line.split(':');
    const hasColon = line.includes(':');

    if (hasColon) {
      currentSpeaker = potentialName;
    }

    const text = hasColon ? rest.join(':').trim() : line.trim();
    return { name: currentSpeaker, text };
  });

  return parsedLines;
};

const getVoiceProperties = (name: string) => {
  // Define your speaker name to gender mapping here
  const speakerGenderMap: { [key: string]: string } = {
    'Speaker 1': 'FEMALE',
    'Speaker 2': 'MALE',
    '(Female)': 'FEMALE',
    '(Male)': 'MALE'
  };

  const gender = speakerGenderMap[name] || 'FEMALE';
  return { gender };
};

export const AnimeCharacter: React.FC<AnimeCharacterProps> = ({ text, speaking }) => {
  const [mouthOpen, setMouthOpen] = useState(false);
  const [subtitles, setSubtitles] = useState<string[]>([]);
  const messageLines = parseMessage(text);
  const { speakText } = useSpeakText();
  const { addToQueue } = useSpeechQueue(speakText); // Add this line
  const currentLineIndexRef = useRef(0); // Use useRef instead of useState
  const lastSpokenMessageIndex = useRef(-1);

  const cancelledRef = useRef(false); // Add this line

  /*useEffect(() => {
    if (speaking && lastSpokenMessageIndex.current < messageLines.length - 1) {
      const index = lastSpokenMessageIndex.current + 1;
      const line = messageLines[index];
      const { gender } = getVoiceProperties(line.name);
      speakText(line.text, 1, gender, 'en-US', '');
      lastSpokenMessageIndex.current = index;
    }
  }, [speaking, text, speakText, messageLines]);*/

  useEffect(() => {
    if (!speaking) {
      setMouthOpen(false);
      cancelledRef.current = true;
      //return;
    }

    const interval = setInterval(() => {
      setMouthOpen((prevState) => !prevState);
    }, 1000);

    const speakLines = async () => {
      for (let index = currentLineIndexRef.current; index < messageLines.length; index++) {
        const line = messageLines[index];
        const { gender } = getVoiceProperties(line.name);
        setSubtitles((prevSubtitles) => {
          const currentSubtitles = [line.text, ...prevSubtitles.slice(0, 2)];
          return currentSubtitles;
        });
        if (cancelledRef.current) {
          cancelledRef.current = false;
          return;
        }
        addToQueue(line.text); // Update this line
        currentLineIndexRef.current++;
      }
    };

    speakLines();

    return () => clearInterval(interval);
  }, [speaking, text, addToQueue, messageLines]); // Update the dependency array

  const characterImage = mouthOpen
    ? '/GAIB_OPEN_MOUTH.png'
    : '/GAIB_CLOSED_MOUTH.png';

  return (
    <div className="anime-character">
      <img src={characterImage} alt="GAIB" className="anime-character" />
      <div className="subtitle-container">
        {speaking &&
          subtitles.map((subtitle, index) => (
            <p key={index} className="subtitle-container">
              {subtitle}
            </p>
          ))}
      </div>
    </div>
  );
};

export default AnimeCharacter;
