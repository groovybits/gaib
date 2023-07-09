// components/DocumentDropdown.tsx
import React, { ChangeEvent, useState } from 'react';
import styles from '@/styles/Home.module.css';

interface DocumentDropdownProps {
  onChange: (value: number) => void;
}

const DocumentDropdown: React.FC<DocumentDropdownProps> = ({ onChange }) => {
  const [documentCount, setDocumentCount] = useState<number>(1);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = parseInt(event.target.value, 10);
    setDocumentCount(selectedValue);
    onChange(selectedValue);
  };

  return (
      <select
        id="documentCount"
        className={styles.dropdown}
        value={documentCount}
        onChange={handleChange}
    >
      <option value="" disabled>
        Number of Documents for Context
      </option>
        {[...Array(13)].map((_, index) => {
          const value = index * 1;
          return (
            <option key={value} value={value}>
              {value} Documents
            </option>
          );
        })}
      </select>
  );
};

export default DocumentDropdown;
