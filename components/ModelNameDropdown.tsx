// components/ModelNameDropdown.tsx
import React, { ChangeEvent, useState } from 'react';
import styles from '@/styles/Home.module.css';

interface ModelNameDropdownProps {
  onChange: (value: string) => void;
}

const ModelNameDropdown: React.FC<ModelNameDropdownProps> = ({ onChange }) => {
  const [modelName, setModelName] = useState<string>(process.env.MODEL_NAME || 'gpt-3.5-turbo-16k');

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = event.target.value;
    setModelName(selectedValue);
    onChange(selectedValue);
  };

  return (
    <select id="modelName" value={modelName} onChange={handleChange} className={styles.dropdown}>
      <option value="" disabled>
        Select a Model
      </option>
      <option value='gpt-4-1106-preview'>GPT-4-128k</option>
      <option value='gpt-4'>GPT-4</option>
      <option value='gpt-3.5-turbo'>GPT-3.5-Turbo</option>
      <option value='gpt-3.5-turbo-16k'>GPT-3.5-Turbo-16k</option>
    </select>
  );
};

export default ModelNameDropdown;
