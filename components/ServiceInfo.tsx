import React from 'react';
import styles from '@/styles/Home.module.css';
import {
  PERSONALITY_PROMPTS,
} from '@/config/personalityPrompts';
import Link from 'next/link';

const ServiceInfo = () => {
  return (
    <>
      <div className={`${styles.header} ${styles.center}`}>
        <div className={styles.footer}>
          <div className={styles.footerContainer}>
            <a href="https://groovy.org">The Groovy Organization</a>&nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="https://github.com/groovybits/gaib">Source Code</a>&nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="https://twitch.tv/groovyaibot">Create Stories</a>&nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="https://youtube.com/@groovyaibot">YouTube</a>&nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="https://facebook.com/groovyorg">Facebook </a>
          </div>
        </div>
      </div>
      <div className={styles.footer}>
        GAIB, the Groovy AI Entertainment System, is an assitant that can understand, speak, and
        translate any language in both text and audio formats. It can also take
        on various AI Helper modes or personalities, each designed for specific
        tasks. Furthermore, GAIB has an Anime generation theme that creates
        stories based on the data from PDFs stored in the vector database.
      </div>
      <div className={styles.footer}>
        WARNING: Any information given to GAIB is not stored or used for any purpose
        other than to generate a response. GAIB is not to be trusted for
        anything serious or important. GAIB is meant for entertainment
        purposes only. Any use of GAIB that is illegal or harmful in any way
        is strictly forbidden and will result in account termination.
      </div>
      <div className={`${styles.header} ${styles.center}`}>
        <h1>AI Assistant Modes</h1>
      </div>
      <div className={styles.cloudform}>
        <table className={styles.personalityTable}>
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
                  <p>{value}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default ServiceInfo;
