import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
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
  timestamp: string; // Changed from firebase.firestore.Timestamp
}

interface InitialProps {
  initialStory: Story | null;
}

const adSenseCode = process.env.NEXT_PUBLIC_ADSENSE_PUB_ID ? process.env.NEXT_PUBLIC_ADSENSE_PUB_ID : '';

const Global: NextPage<InitialProps> = ({ initialStory }) => {
  const router = useRouter();
  const { storyId }: ParsedUrlQuery = router.query;
  const [selectedStory, setSelectedStory] = useState(initialStory);
  const [currentScene, setCurrentScene] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [leftHover, setLeftHover] = useState(false);
  const [rightHover, setRightHover] = useState(false);

  useEffect(() => {
    if (storyId && typeof storyId === 'string') {
      const fetchStory = async () => {
        // Fetch the story JSON data from the Google Cloud Storage bucket
        const response = await fetch(`https://storage.googleapis.com/gaib/stories/${storyId}/data.json`);
        if (response.ok) {
          const storyData = await response.json();
          setSelectedStory({ id: storyId, ...storyData });
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

  const handleLinkedInShareClick = (storyId: string | string[]) => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(`${baseUrl}/${storyId}`)}`, '_blank');
  };

  const handleTwitterShareClick = (storyId: string | string[]) => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(`${baseUrl}/${storyId}`)}`, '_blank');
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
          <script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adSenseCode}`} crossOrigin="anonymous"></script>
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
                    <div className={isFullScreen ? `${styles.subtitle}` : styles.subtitle}>
                      {scenes[currentScene].replace(/\|$/g, '')}
                    </div>
                    <>
                      <div
                        style={{
                          position: "absolute",
                          top: "10%", // adjust this value as needed to leave space for the fullscreen button
                          bottom: 0,
                          left: 0,
                          width: "50%", // covers the left half of the image area
                          cursor: "pointer", // changes the cursor to a hand when hovering over the div
                          backgroundColor: leftHover ? "rgba(0, 0, 0, 0.1)" : "transparent",
                        }}
                        onClick={previousPage}
                        onMouseEnter={() => setLeftHover(true)} // set state to true when mouse enters
                        onMouseLeave={() => setLeftHover(false)} // set state to false when mouse leaves                      
                      >
                        <button
                          style={{
                            position: "absolute",
                            top: "65%",
                            left: "90px",
                            transform: "translateY(-65%)",
                          }}
                          className={styles.readerPager}
                        >
                          {/* Previous Page Click left side of screen */}
                        </button>
                      </div>
                      <div
                        style={{
                          position: "absolute",
                          top: "10%", // adjust this value as needed to leave space for the fullscreen button
                          bottom: 0,
                          right: 0,
                          width: "50%", // covers the right half of the image area
                          cursor: "pointer", // changes the cursor to a hand when hovering over the div
                          backgroundColor: rightHover ? "rgba(0, 0, 0, 0.1)" : "transparent",
                        }}
                        onClick={nextPage} // attach the event handler to the div
                        onMouseEnter={() => setRightHover(true)} // set state to true when mouse enters
                        onMouseLeave={() => setRightHover(false)} // set state to false when mouse leaves    
                      >
                        <button
                          style={{
                            position: "absolute",
                            top: "65%",
                            right: "90px",
                            transform: "translateY(-65%)",
                            transition: "background-color 0.3s", // smooth transition
                          }}
                          className={styles.readerPager}
                        >
                          {/* Previous Page Click left side of screen */}
                        </button>
                      </div>
                    </>
                  </div>
                </div>
              </div>
              <>
                <Link href="/feed" className={styles.footer}>
                  <a>Story Board</a>
                </Link>&nbsp;&nbsp;&nbsp;&nbsp;
              </>
              <button className={styles.footer} onClick={() => storyId && handleShareClick(storyId)}>Copy Link</button>
              &nbsp;&nbsp;&nbsp;&nbsp;
              <button className={styles.footer} onClick={() => storyId && handleFacebookShareClick(storyId)}>Share on Facebook</button>
              &nbsp;&nbsp;&nbsp;&nbsp;
              <button className={styles.footer} onClick={() => storyId && handleLinkedInShareClick(storyId)}>Share on LinkedIn</button>
              &nbsp;&nbsp;&nbsp;&nbsp;
              <button className={styles.footer} onClick={() => storyId && handleTwitterShareClick(storyId)}>Share on Twitter</button>
            </div>
            <div className={styles.feedSection}>
              <div className={styles.feed}>
                <Link href="https://twitch.tv/groovyaibot" className={styles.header}>
                  <a>Create a Story</a>
                </Link>
              </div>
              <div className={`${styles.footer} ${styles.center}`}>
                <div className={styles.footerContainer}>
                  <a href="https://groovy.org">Groovy</a>&nbsp;&nbsp;|&nbsp;&nbsp;
                  <a href="https://github.com/groovybits/gaib">Groovy Code</a>&nbsp;&nbsp;|&nbsp;&nbsp;
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
    // Fetch the story JSON data from the Google Cloud Storage bucket
    const response = await fetch(`https://storage.googleapis.com/gaib/stories/${storyId}/data.json`);
    if (response.ok) {
      const storyData = await response.json();
      initialStory = { id: storyId, ...storyData };
    }
  }

  return { initialStory };
};

export default Global;
