// components/ModeDropdown.tsx
import React, { ChangeEvent, useState } from 'react';
import styles from '@/styles/Home.module.css';

interface ThemeDropdownProps {
  onChange: (value: string) => void;
}

const ThemeDropdown: React.FC<ThemeDropdownProps> = ({ onChange }) => {
  const [mode, setMode] = useState<string>('MultiModal');

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = event.target.value;
    setMode(selectedValue);
    onChange(selectedValue);
  };

  return (
    <select id="mode" value={mode} onChange={handleChange} className={styles.dropdown}>
      <option value="" disabled>
        Themes
      </option>
        <option value='MultiModal'>MultiModal</option>
        <option value='Terminal'>Terminal</option>
      </select>
  );
};

export default ThemeDropdown;
