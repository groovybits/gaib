import React, { useState, useEffect } from 'react';
import styles from '@/styles/Home.module.css';
import { Episode } from '@/types/story';

// Add the Episode type to the EpisodePlannerProps interface
type EpisodePlannerProps = {
  episodes: Episode[]; // Add this prop
  onNewEpisode: (episode: Episode) => void;
  onEpisodeChange: (episodes: Episode[]) => void;
};

function EpisodePlanner({ episodes: episodesProp, onNewEpisode, onEpisodeChange }: EpisodePlannerProps) {
  const [episodes, setEpisodes] = useState<Episode[]>(episodesProp);

  // Update the local episodes state whenever the episodes prop changes
  useEffect(() => {
    setEpisodes(episodesProp);
  }, [episodesProp]);

  const [title, setTitle] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [type, setType] = useState('');
  const [username, setUsername] = useState('');
  const [namespace, setNamespace] = useState('');
  const [personality, setPersonality] = useState('');
  const [prompt, setPrompt] = useState('');
  const [refresh, setRefresh] = useState(false);
  const [sourceDocs, setSourceDocs] = useState([]);

  const handleAddEpisode = () => {
    const newEpisodes: Episode[] = [...episodes];
    const index = newEpisodes.findIndex(episode => episode.title === title);
    if (index !== -1) {
      newEpisodes[index] = { title, type, username, namespace, personality, refresh, prompt, sourceDocs };
      // Call onEpisodeChange with the new list of episodes
      onEpisodeChange(newEpisodes);
    } else {
      const newEpisode = { title, type, username, namespace, personality, refresh, prompt, sourceDocs };
      newEpisodes.push(newEpisode);
      // Call onNewEpisode with the new episode
      onNewEpisode(newEpisode);
    }
    setEpisodes(newEpisodes);
    setTitle('');
    setShowModal(false);
    setType('');
    setUsername('');
  };

  return (
    <>
      <button className={styles.footer} onClick={() => setShowModal(true)}>Automation Schedule</button>

      {showModal && (
        <>
          <div className={styles.cloudform}>
            <div className={styles.cloudform}>
            <input
              className={styles.textarea}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Episode Description and Plotline"
              />
            </div>
            <div className={styles.cloudform}>
              <button className={styles.header} onClick={handleAddEpisode}>Add</button>&nbsp;&nbsp;&nbsp;&nbsp;
              <button className={styles.header} onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </>
      )}

      <table className={`${styles.episodeTable} ${styles.episodeList}`}>
        {[...episodes].map((episode, index) => (
          <tr key={index}>
            <td>
              <p className={`${styles.footer} ${styles.episodeList}`}>Episode {index + 1}: &quot;{episode.title}&quot;</p>
            </td>
          </tr>
        ))}
      </table>
    </>
  );
}

export default EpisodePlanner;
