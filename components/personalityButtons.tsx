// PersonalityButtons.tsx
import React from 'react';
import styles from '@/styles/Home.module.css';
import { PERSONALITY_PROMPTS } from '../config/personalityPrompts';

interface PersonalityButtonsProps {
  onSelect: (value: string) => void;
}

const space = '&nbsp;&nbsp;';
const PersonalityButtons: React.FC<PersonalityButtonsProps> = ({ onSelect }) => {
  return (
    <div className={styles.buttonWrapper}>
      {Object.keys(PERSONALITY_PROMPTS).map((key) => (
        <button className={styles.personalitybuttons} key={key} onClick={() => onSelect(key)}>
          {key}
        </button>
      ))}{space}
    </div>
  );
};

export default PersonalityButtons;
