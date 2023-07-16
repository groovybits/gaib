import React, { useState } from 'react';
import styles from '@/styles/Home.module.css';

// Define a type for an episode
type Episode = {
  title: string;
  plotline: string;
};

// Define the props for the EpisodePlanner component
type EpisodePlannerProps = {
  onNewEpisode: (episode: Episode) => void; // This is a function that takes an Episode and returns nothing
  onEpisodeChange: (episodes: Episode[]) => void; // This is a function that takes an array of Episodes and returns nothing
};

function EpisodePlanner({ onNewEpisode, onEpisodeChange }: EpisodePlannerProps) {
  // Use the Episode type for the state variable
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [title, setTitle] = useState('');
  const [plotline, setPlotline] = useState('');
  const [showModal, setShowModal] = useState(false);

  const handleAddEpisode = () => {
    const newEpisodes = [...episodes];
    const index = newEpisodes.findIndex(episode => episode.title === title && episode.plotline === plotline);
    if (index !== -1) {
      newEpisodes[index] = { title, plotline };
      // Call onEpisodeChange with the new list of episodes
      onEpisodeChange(newEpisodes);
    } else {
      const newEpisode = { title, plotline };
      newEpisodes.push(newEpisode);
      // Call onNewEpisode with the new episode
      onNewEpisode(newEpisode);
    }
    setEpisodes(newEpisodes);
    setTitle('');
    setPlotline('');
    setShowModal(false);
  };

  return (
    <>
      <button className={styles.header} onClick={() => setShowModal(true)}>Add Episode to Playback Queue</button>

      {showModal && (
        <>
          <div className={styles.cloudform}>
            <div className={styles.cloudform}>
              <h2 className={styles.header}>Episode Title and Plotline</h2>
            </div>
            <div className={styles.cloudform}>
            <input
              className={styles.textarea}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Episode Title"
              />
            </div>
            <div className={styles.cloudform}>
            <textarea
              className={styles.textarea}
              value={plotline}
              onChange={(e) => setPlotline(e.target.value)}
              placeholder="Episode Plotline"
              />
            </div>
            <div className={styles.cloudform}>
              <button className={styles.footer} onClick={handleAddEpisode}>Add</button>
              <button className={styles.footer} onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </>
      )}

      <table className={`${styles.table} ${styles.episodeList}`}>
        {[...episodes].map((episode, index) => (
          <tr key={index}>
            <td>
              <p className={styles.footer}>Episode {index + 1}: &quot;{episode.title}&quot;</p>
            </td><tr></tr>
            <td>
              <p className={styles.footer}>{episode.plotline}</p>
            </td>
          </tr>
        ))}
      </table>
    </>
  );
}

export default EpisodePlanner;
