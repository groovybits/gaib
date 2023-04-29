import React from 'react';
import styles from '@/styles/Home.module.css'

interface PexelsCreditProps {
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
}

const PexelsCredit: React.FC<PexelsCreditProps> = ({ photographer, photographerUrl, pexelsUrl }) => {
  if (!photographer && !photographerUrl && !pexelsUrl) {
    return null;
  }

  return (
    <p className={styles["pexels-credit"]}>
      Photo by{' '}
      {photographerUrl ? (
        <a href={photographerUrl} target="_blank" rel="noopener noreferrer">
          {photographer}
        </a>
      ) : (
        photographer
      )}{' '}
      on{' '}
      {pexelsUrl ? (
        <a href={pexelsUrl} target="_blank" rel="noopener noreferrer">
          Pexels
        </a>
      ) : (
        'Pexels'
      )}
    </p>
  );
};

export default PexelsCredit;
