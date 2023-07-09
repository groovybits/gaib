// components/ModeDropdown.tsx
import React, { ChangeEvent, useState } from 'react';
import styles from '@/styles/Home.module.css';

interface ModeDropdownProps {
  onChange: (value: string) => void;
}

const ModeDropdown: React.FC<ModeDropdownProps> = ({ onChange }) => {
  const [mode, setMode] = useState<string>('story');

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = event.target.value;
    setMode(selectedValue);
    onChange(selectedValue);
  };

  return (
    <select id="mode" value={mode} onChange={handleChange} className={styles.dropdown}>
      <option value="" disabled>
        Mode
      </option>
        <option value='story'>Story</option>
        <option value='question'>Question</option>
    </select>
  );
};

export default ModeDropdown;
