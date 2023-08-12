// components/FastModelNameDropdown.tsx
import React, { ChangeEvent, useState } from 'react';
import styles from '@/styles/Home.module.css';

interface FastModelNameDropdownProps {
  onChange: (value: string) => void;
}

const FastModelNameDropdown: React.FC<FastModelNameDropdownProps> = ({ onChange }) => {
  const [fastModelName, setFastModelName] = useState<string>(process.env.QUESTION_MODEL_NAME || 'gpt-3.5-turbo-16k');

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = event.target.value;
    setFastModelName(selectedValue);
    onChange(selectedValue);
  };

  return (
    <select id="fastModelName" value={fastModelName} onChange={handleChange} className={styles.dropdown}>
      <option value="" disabled>
        Select a Fast Model
      </option>
      <option value='gpt-4'>GPT-4</option>
      <option value='gpt-3.5-turbo'>GPT-3.5-Turbo</option>
      <option value='gpt-3.5-turbo-16k'>GPT-3.5-Turbo-16k</option>
    </select>
  );
};

export default FastModelNameDropdown;
