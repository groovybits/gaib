// PersonalityNamespaceDropdown.tsx
import React, { ChangeEvent } from 'react';
import styles from '@/styles/Home.module.css';

const NAMESPACE_VALUES = {
  groovypdf: "Magic Mix",
  videoengineer: "Video Engineer"
};

interface PersonalityNamespaceDropdownProps {
  setSelectedNamespace: (value: string) => void;
}

const PersonalityNamespaceDropdown: React.FC<PersonalityNamespaceDropdownProps> = ({ setSelectedNamespace }) => {
  const [selectedNamespace, setSelectedNamespaceState] = React.useState("groovybits");

  React.useEffect(() => {
    setSelectedNamespace(selectedNamespace);
  }, []);

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedNamespaceState(value);
    setSelectedNamespace(value);
  };

  return (
    <select
      className={styles.dropdown}
      value={selectedNamespace}
      onChange={handleChange}
    >
      {Object.entries(NAMESPACE_VALUES).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
};

export default PersonalityNamespaceDropdown;
