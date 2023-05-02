import React from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/Home.module.css';

const Custom404 = () => {
  return (
    <div>
      <div className={styles.header}>
        <title>GAIB The Groovy AI Bot - Page Not Found</title>
        <h1>GAIB The Groovy AI Bot</h1>
      </div>
      <Layout>
        <div className="mx-auto flex flex-col gap-4 bg-#FEC601">
          <main className={styles.main}>
            <div className={styles.center}>
              <div className={styles.errorMessage}>
                <h2>Error 404 - Page Not Found</h2>
                <p>Oops! It looks like the page you are looking for does not exist.</p>
              </div>
            </div>
          </main>
        </div>
      </Layout>
      <div className={styles.footer}>
        <div className={styles.footerContainer}>
          <a href="https://groovy.org">The Groovy Organization</a>&nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="https://www.pexels.com">Photos provided by Pexels</a>&nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="https://github.com/groovybits/gaib">github.com/groovybits/gaib</a>&nbsp;&nbsp;|&nbsp;&nbsp;
        </div>
      </div>
    </div>
  );
};

export default Custom404;

