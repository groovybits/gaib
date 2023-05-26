// components/ModeDropdown.tsx
import React, { ChangeEvent, useState } from 'react';
import styles from '@/styles/Home.module.css';

interface ThemeDropdownProps {
  onChange: (value: string) => void;
}

const ThemeDropdown: React.FC<ThemeDropdownProps> = ({ onChange }) => {
  const [mode, setMode] = useState<string>('Anime');

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = event.target.value;
    setMode(selectedValue);
    onChange(selectedValue);
  };

  return (
    <select id="mode" value={mode} onChange={handleChange} className={styles.dropdown}>
        <option value='Anime'>Anime Theme</option>
        <option value='Terminal'>Terminal Theme</option>
      </select>
  );
};

export default ThemeDropdown;