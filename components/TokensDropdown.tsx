// components/TokensDropdown.tsx
import React, { ChangeEvent, useState } from 'react';

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
    <div>
      <select
        id="tokensCount"
        value={tokensCount}
        onChange={handleChange}
      >
        {[...Array(30)].map((_, index) => {
          const value = index * 100;
          return (
            <option key={value} value={value}>
              {(value !== 0)? value : "Max"} Tokens
            </option>
          );
        })}
      </select>
    </div>
  );
};

export default TokensDropdown;
