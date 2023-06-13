// components/TokensDropdown.tsx
import React, { ChangeEvent, useState } from 'react';
import styles from '@/styles/Home.module.css';

interface TokensDropdownProps {
  onChange: (value: number) => void;
}

const TokensDropdown: React.FC<TokensDropdownProps> = ({ onChange }) => {
  const [tokensCount, setTokensCount] = useState<number>(0);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = parseInt(event.target.value, 10);
    setTokensCount(selectedValue);
    onChange(selectedValue);
  };

  return (
      <select
        id="tokensCount"
        className={styles.dropdown}
        value={tokensCount}
        onChange={handleChange}
      >
        {[...Array(81)].map((_, index) => {
          const value = index * 100;
          return (
            <option key={value} value={value}>
              {value} Tokens
            </option>
          );
        })}
      </select>
  );
};

export default TokensDropdown;
