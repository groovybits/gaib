import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import firebase from '@/config/firebaseClientInit';
import styles from '@/styles/Home.module.css';
import Link from 'next/link';
import copy from 'copy-to-clipboard';
import { NextPage, NextPageContext } from 'next';
import Head from 'next/head';
import PexelsCredit from '@/components/PexelsCredit';
import { ParsedUrlQuery } from 'querystring';
import Layout from '@/components/Layout';

interface Story {
  id: string;
  text: string;
  imageUrls: string[];
  timestamp: firebase.firestore.Timestamp;
}

interface InitialProps {
  initialStory: Story | null;
}

const Global: NextPage<InitialProps> = ({ initialStory }) => {
  const router = useRouter();
  const { storyId }: ParsedUrlQuery = router.query;
  const [selectedStory, setSelectedStory] = useState(initialStory);
  const [currentScene, setCurrentScene] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (storyId && typeof storyId === 'string') {
      const fetchStory = async () => {
        const doc = await firebase.firestore().collection('stories').doc(storyId).get();
        if (doc.exists) {
          setSelectedStory({ id: doc.id, ...doc.data() } as Story);
        }
      };
      fetchStory();
    }
  }, [storyId]);

  const handleShareClick = (storyId: string | string[]) => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    copy(`${baseUrl}/${storyId}`);
    alert(`Copied ${baseUrl}/${storyId} to clipboard!`);
  };

  const handleFacebookShareClick = (storyId: string | string[]) => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${baseUrl}/${storyId}`)}`, '_blank');
  };

  const nextPage = () => {
    if (selectedStory && currentScene < selectedStory.text.split('|').length - 1) {
      setCurrentScene(currentScene + 1);
    }
  };

  const previousPage = () => {
    if (currentScene > 0) {
      setCurrentScene(currentScene - 1);
    }
  };

  // toggle the full screen state
  const toggleFullScreen = () => {
    const readerImageContainer = document.querySelector(`.${styles.readerImageContainer}`);
    const image = document.querySelector(`.${styles.generatedImage} img`);

    if (!document.fullscreenElement) {
      if (readerImageContainer?.requestFullscreen) {
        readerImageContainer.requestFullscreen();
        image?.classList.add(styles.readerFullScreenImage);
        setIsFullScreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        image?.classList.remove(styles.readerFullScreenImage);
        setIsFullScreen(false);
      }
    }
  };

  if (selectedStory) {
    const scenes = selectedStory.text.split('|');
    const imageUrl = selectedStory.imageUrls[currentScene % selectedStory.imageUrls.length];
    // Parse the JSON string to get the image details
    const imageDetails = JSON.parse(imageUrl);

    // Extract the image URL and other details
    const actualImageUrl = imageDetails.url;
    const photographer = imageDetails.photographer;
    const photographerUrl = imageDetails.photographer_url;
    const pexelsUrl = imageDetails.pexels_url;

    return (
      <>
        <Head>
          <title>{scenes[0].replace(/\|$/g, '')}</title>
          <meta name="description" content={scenes[1] ? scenes.slice(1).join(' ').slice(0, 500) : scenes[0]} />
          <meta property="og:title" content={scenes[0].replace(/\|$/g, '')} />
          <meta property="og:description" content={scenes[1] ? scenes.slice(1).join(' ').slice(0, 500) : scenes[0]} />
          <meta property="og:image" content={imageUrl} />
          <meta property="og:url" content={`${process.env.NEXT_PUBLIC_BASE_URL || ''}/${storyId}`} />
        </Head>
        <Layout>
          <div className="mx-auto flex flex-col gap-4 bg-#FFCC33">
            <div className={styles.main}>
              <div className={styles.cloud}>
                <div
                  className={styles.readerImageContainer}
                  style={{
                    position: isFullScreen ? "fixed" : "relative",
                    top: isFullScreen ? 0 : "auto",
                    left: isFullScreen ? 0 : "auto",
                    width: isFullScreen ? "auto" : "auto",
                    height: isFullScreen ? "100vh" : "100%",
                    zIndex: isFullScreen ? 1000 : "auto",
                    backgroundColor: isFullScreen ? "black" : "transparent",
                  }}
                >
                  <div className={styles.readerImage}>
                    {(actualImageUrl === '' || (process.env.NEXT_PUBLIC_IMAGE_SERVICE != "pexels")) ? "" : (
                      <div>
                        <PexelsCredit photographer={photographer} photographerUrl={photographerUrl} pexelsUrl={pexelsUrl} />
                      </div>
                    )}
                    <button
                      type="button"
                      className={styles.fullscreenButton}
                      style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                      }}
                      onClick={toggleFullScreen}
                    >
                      {isFullScreen ? "Exit Full Screen" : "Full Screen"}
                    </button>
                    <img
                      src={actualImageUrl}
                      alt="Scene"
                    />
                    <div className={isFullScreen ? styles.readerFullScreenSubtitle : styles.subtitle}>{scenes[currentScene].replace(/\|$/g, '')}</div>
                  </div>
                  <div className={`${styles.footer} ${styles.center}`}>
                    <button onClick={previousPage} className={styles.pageButton}>Previous Page</button>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    <button onClick={nextPage} className={styles.pageButton}>Next Page</button>
                  </div>
                </div>
              </div>
              <button className={styles.footer} onClick={() => storyId && handleShareClick(storyId)}>Copy Link</button>
              &nbsp;&nbsp;&nbsp;&nbsp;
              <button className={styles.footer} onClick={() => storyId && handleFacebookShareClick(storyId)}>Facebook Post</button>
            </div>
            <div className={styles.feedSection}>
              <div className={styles.feed}>
                <Link href="https://twitch.tv/groovyaibot" className={styles.header}>
                  <a>Create a Story</a>
                </Link>
              </div>
              <div className={`${styles.footer} ${styles.center}`}>
                <div className={styles.footerContainer}>
                  <a href="https://groovy.org">Groovy.ORG</a>&nbsp;&nbsp;|&nbsp;&nbsp;
                  <a href="https://github.com/groovybits/gaib">Source Code</a>&nbsp;&nbsp;|&nbsp;&nbsp;
                  <a href="https://twitch.tv/groovyaibot">Create Story</a>&nbsp;&nbsp;|&nbsp;&nbsp;
                  <a href="https://youtube.com/@groovyaibot">YouTube</a>&nbsp;&nbsp;|&nbsp;&nbsp;
                  <a href="https://facebook.com/groovyorg">Facebook</a>
                </div>
              </div>
            </div>
          </div>
        </Layout>
      </>
    );
  }

  return null;
};

Global.getInitialProps = async (ctx: NextPageContext) => {
  const { storyId }: ParsedUrlQuery = ctx.query;
  let initialStory: Story | null = null;

  if (storyId && typeof storyId === 'string') {
    const doc = await firebase.firestore().collection('stories').doc(storyId).get();
    if (doc.exists) {
      initialStory = { id: doc.id, ...doc.data() } as Story;
    }
  }

  return { initialStory };
};

export default Global;
