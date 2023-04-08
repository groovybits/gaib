import React, { useState, useEffect } from 'react';

interface AnimeCharacterProps {
  text: string;
  speaking: boolean;
}

export const AnimeCharacter: React.FC<AnimeCharacterProps> = ({ text, speaking }) => {
  const [mouthOpen, setMouthOpen] = useState(false);

  useEffect(() => {
    if (speaking && text.length > 0) {
      const interval = setInterval(() => {
        setMouthOpen((prevState) => !prevState);
      }, 300);
      return () => clearInterval(interval);
    } else {
      setMouthOpen(false);
    }
  }, [speaking]);

  const characterImage = mouthOpen
    ? '/GAIB_OPEN_MOUTH.png'
    : '/GAIB_CLOSED_MOUTH.png';

  return (
    <div className="anime-character">  
      <img src={characterImage} alt="GAIB" />
      <div className="subtitle-container">
      <p>{text}</p>
      </div>
    </div>
  );
};

export default AnimeCharacter;
