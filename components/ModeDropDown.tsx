// components/ModeDropdown.tsx
import React, { ChangeEvent, useState } from 'react';

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
    <div>
      <select id="mode" value={mode} onChange={handleChange}>
        <option value='story'>Story Mode</option>
        <option value='question'>Question Mode</option>
      </select>
    </div>
  );
};

export default ModeDropdown;
