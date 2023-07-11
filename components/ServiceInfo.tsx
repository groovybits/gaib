import React from 'react';
import styles from '@/styles/Home.module.css';
import {
  PERSONALITY_PROMPTS,
} from '@/config/personalityPrompts';
import Link from 'next/link';

const ServiceInfo = () => {
  return (
    <>
      <div className={styles.header}>
        <Link href="/board/">
          <a onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              window.open('/board/', '_blank');
            }
          }}>Browse Shared Stories</a>
        </Link>&nbsp;&nbsp;|&nbsp;&nbsp;
        <a href="https://groovy.org">The Groovy Organization</a>&nbsp;&nbsp;|&nbsp;&nbsp;
        <a href="https://github.com/groovybits/gaib">Source Code</a>
      </div>
      <div className={styles.footer}>
        GAIB, the Groovy AI Bot, is a chatbot that can understand, speak, and
        translate any language in both text and audio formats. It can also take
        on various AI bot modes or personalities, each designed for specific
        tasks. Furthermore, GAIB has an Anime generation theme that creates
        stories based on the data from PDFs stored in the vector database.
      </div>
      <div className={styles.header}>
        <h1>AI Bot Modes</h1>
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
