import React from 'react';
import styles from '@/styles/Home.module.css';
import {
  PERSONALITY_PROMPTS,
} from '@/config/personalityPrompts';
import Link from 'next/link';

const ServiceInfo = () => {
  return (
    <>
      <div className={`${styles.imageContainer} ${styles.center}`}>
        <img src={process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE ? process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE : ''} alt="Groovy" />
      </div>
      <div className={`${styles.header} ${styles.center}`}>
        <a href="https://twitch.tv/groovyaibot">Create your own story</a>&nbsp;&nbsp;|&nbsp;&nbsp;     
        <a href="https://ai.groovy.org/feed">View other stories</a>
      </div>
      <div className={`${styles.footer} ${styles.center}`}>       
          <a href="https://groovy.org">Groovy</a>&nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="https://twitch.tv/groovyaibot">Twitch</a>&nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="https://youtube.com/@groovyaibot">YouTube</a>&nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="https://facebook.com/groovyorg">Facebook </a>      
      </div>
      <div className={`${styles.center}`}>
        Disclaimer: Groovy is not to be trusted for
        anything serious or important. Groovy is meant for entertainment
        purposes only.
      </div>
      <div className={`${styles.footer} ${styles.center}`}>
        2023 Groovy - by The Groovy Organization
      </div>
    </>
  );
};

export default ServiceInfo;
