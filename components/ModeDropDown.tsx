// components/ModeDropdown.tsx
import React, { ChangeEvent, useState } from 'react';
import styles from '@/styles/Home.module.css';

interface ModeDropdownProps {
  onChange: (value: string) => void;
}

const ModeDropdown: React.FC<ModeDropdownProps> = ({ onChange }) => {
  const [mode, setMode] = useState<string>('question');

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = event.target.value;
    setMode(selectedValue);
    onChange(selectedValue);
  };

  return (
    <select id="mode" value={mode} onChange={handleChange} className={styles.dropdown}>
      <option value="" disabled>
        QA or Story Mode
      </option>
      <option value='question'>Ask Questions</option>
      <option value='story'>Create Stories</option>
    </select>
  );
};

export default ModeDropdown;
