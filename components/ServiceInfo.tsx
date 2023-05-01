import React from 'react';
import styles from '@/styles/Home.module.css';
import {
  PERSONALITY_PROMPTS,
  CONDENSE_PROMPT,
  CONDENSE_PROMPT_QUESTION,
} from '@/config/personalityPrompts';

const ServiceInfo = () => {
  return (
    <div className={styles.cloud}>
      <div className={styles.serviceInfo}>
        <div className={styles.header}>
          <div className={styles.header}>
            <a href="https://groovy.org">The Groovy Organization</a>&nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="https://www.pexels.com">Photos provided by Pexels</a>&nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="https://github.com/groovybits/gaib">github.com/groovybits/gaib</a>
          </div>
        </div>
        <div className={styles.header}>
          GAIB, the Groovy AI Bot, is a chatbot that can understand, speak, and
          translate any language in both text and audio formats. It can also take
          on various AI bot modes or personalities, each designed for specific
          tasks. Furthermore, GAIB has an Anime generation theme that creates
          stories based on the data from PDFs stored in the vector database.
        </div>
        <div className={styles.header}>
          <h1>AI Bot Modes</h1>
        </div>
        <div className={styles.serviceInfoContent}>
        </div>
        <div className={styles.serviceInfoTable}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Personality</th>
                <th>Prompt</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(PERSONALITY_PROMPTS).map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>
                    <pre>{value}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ServiceInfo;
