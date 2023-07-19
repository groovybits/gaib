// components/EpisodeDropdown.tsx
import React, { ChangeEvent, useState } from 'react';
import styles from '@/styles/Home.module.css';

interface EpisodeDropdownProps {
  onChange: (value: number) => void;
}

const EpisodeDropdown: React.FC<EpisodeDropdownProps> = ({ onChange }) => {
  const [episodeCount, setEpisodeCount] = useState<number>(1);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = parseInt(event.target.value, 10);
    setEpisodeCount(selectedValue);
    onChange(selectedValue);
  };

  return (
      <select
        id="episodeCount"
        className={styles.dropdown}
        value={episodeCount}
        onChange={handleChange}
    >
      <option value="" disabled>
        Number of Episodes / QAs
      </option>
        {[...Array(4)].map((_, index) => {
          const value = index + 1;
          return (
            <option key={value} value={value}>
              {value} Episodes / QAs
            </option>
          );
        })}
      </select>
  );
};

export default EpisodeDropdown;
