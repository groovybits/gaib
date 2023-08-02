import { useState, useEffect, useRef, useCallback } from 'react';
import styles from '@/styles/Home.module.css';
import { Story } from '@/types/story';
import Head from 'next/head';

const adSenseCode = process.env.NEXT_PUBLIC_ADSENSE_PUB_ID ? process.env.NEXT_PUBLIC_ADSENSE_PUB_ID : '';
const gaibImage = process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE ? process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE : '';
const debug = process.env.NEXT_PUBLIC_DEBUG ? process.env.NEXT_PUBLIC_DEBUG === 'true' : false;

export default function Feed() {
  const [stories, setStories] = useState<Story[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null); // State for the currently expanded story

  // Set the length of the interval in milliseconds
  const FETCH_REQUEST_INTERVAL = 3000; // Adjust this value as needed

  const lastFetchTime = useRef(0);

  const fetchStories = useCallback(async () => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTime.current;

    // If it's been less than FETCH_REQUEST_INTERVAL since the last fetch, don't fetch again
    if (timeSinceLastFetch < FETCH_REQUEST_INTERVAL && lastFetchTime.current !== 0) {
      console.log(`Fetch rate limited. Time since last fetch is ${timeSinceLastFetch}ms`);
      return;
    }

    // Update the last fetch time
    lastFetchTime.current = now;

    // Actual fetch code
    try {
      const tokenParam = nextPageToken ? `?nextPageToken=${nextPageToken}` : '';
      const response = await fetch(`/api/stories${tokenParam}`);
      const data = await response.json();
      if (debug) {
        console.log('Received stories:', data); // Log the received stories
      }
      if (!data.items || !Array.isArray(data.items)) {
        console.error('Unexpected response from API:', data);
        return;
      }
      setStories((prevStories) => [...prevStories, ...data.items]); // Use data.items directly
      setNextPageToken(data.nextPageToken); // Update nextPageToken
    } catch (error) {
      console.error('Error fetching stories:', error); // Log any errors that occur
    }
  }, [nextPageToken]); // Add nextPageToken as a dependency

  useEffect(() => {
    const handleScroll = () => {
      // Set a threshold of 200px from the bottom of the page
      const threshold = 200;
      if (window.innerHeight + document.documentElement.scrollTop < document.documentElement.offsetHeight - threshold) return;
      fetchStories();
    };
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [fetchStories]);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  const handleStoryClick = (storyId: string) => {
    if (expandedStoryId === storyId) {
      setExpandedStoryId(null); // If the story is already expanded, collapse it
    } else {
      setExpandedStoryId(storyId); // Otherwise, expand the clicked story
    }
  };

  const handleShareClick = (storyId: string) => {
    const url = `${window.location.origin}/${storyId}`;
    navigator.clipboard.writeText(url);
    alert(`Copied ${url} to clipboard!`);
  };

  const handleFacebookShareClick = (storyId: string) => {
    const url = `${window.location.origin}/${storyId}`;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  };

  const handleLinkedInShareClick = (storyId: string) => {
    const url = `${window.location.origin}/${storyId}`;
    window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}`, '_blank');
  };

  const handleTwitterShareClick = (storyId: string) => {
    const url = `${window.location.origin}/${storyId}`;
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`, '_blank');
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Groovy</title>
        <meta name="description" content="Groovy - The Stories are for You." />
        <meta property="og:title" content="Groovy" />
        <meta property="og:description" content="Groovy Stories Created by You." />
        <meta property="og:image" content={gaibImage} />
        <meta property="og:url" content={`${process.env.NEXT_PUBLIC_BASE_URL || ''}/feed`} />
        <script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adSenseCode}`} crossOrigin="anonymous"></script>
      </Head>
      <div className={styles.feedSection}>
        <div className={styles.feed}>
          {stories.map((story, index) => {
            const thumbnailSrc = story.thumbnailUrls && story.thumbnailUrls.length > 0 ? story.thumbnailUrls[0] : story.scenes ? story.scenes[0].imageUrl : story.imageUrl; // Use the first thumbnailUrl if it exists, otherwise use the first scene's imageUrl
            const dateString = new Date(story.timestamp).toLocaleDateString();

            return (
              <div key={story.id} className={styles.story}>
                <p className={styles.storyTimestamp}>{dateString}</p>
                <a onClick={() => handleStoryClick(story.id)} className={styles.storyTitle}>
                  <img
                    src={thumbnailSrc}
                    alt=""
                    className={styles.storyImageThumbnailTitle}
                    style={{
                      width: '128px',
                      padding: '4px',
                      objectFit: 'contain'
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {story.title} {/* Use the first sentence of the first scene as the title */}
                  </div>
                </a>
                <div className={styles.shareButtons}>
                  <a href={`/${story.id}`} target="_blank" rel="noopener noreferrer">View Story</a>
                  <button onClick={() => handleShareClick(story.id)}>Copy Link</button>
                  <button onClick={() => handleFacebookShareClick(story.id)}>Share on Facebook</button>
                  <button onClick={() => handleLinkedInShareClick(story.id)}>Share on LinkedIn</button>
                  <button onClick={() => handleTwitterShareClick(story.id)}>Share on Twitter</button>
                </div>
                {expandedStoryId === story.id && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    fontSize: '12px',
                    maxHeight: '100%',
                    maxWidth: '90vw',
                    overflowY: 'auto',
                    overflowX: 'hidden'
                  }}>
                    {story.scenes ? story.scenes.map((scene, sceneIndex) => (
                      <div key={sceneIndex}>
                        <p style={{ whiteSpace: 'pre-wrap' }}>
                          {scene.sentences && scene.sentences.length > 0 ? scene.sentences.map((sentence, sentenceIndex) => sentence.text).join('\n') : ''}
                        </p>
                      </div>
                    )) : (
                        <div key={0}>
                          <p style={{ whiteSpace: 'pre-wrap' }}>
                            {story.prompt}
                          </p>
                      </div>        
                    )}
                    <div style={{ display: 'flex', flexDirection: 'row', overflowX: 'scroll' }}>
                      {story.thumbnailUrls && story.thumbnailUrls.length > 0 ? (
                        story.thumbnailUrls.map((thumbnailUrl, index) => (
                          <img
                            key={index}
                            src={thumbnailUrl}
                            alt=""
                            style={{
                              width: '256px',
                              padding: '4px',
                              objectFit: 'contain',
                              margin: '10px'
                            }}
                          />
                        ))
                      ) : story.scenes ? (
                        story.scenes.map((scene, sceneIndex) => (
                          <img
                            key={sceneIndex}
                            src={scene.imageUrl}
                            alt=""
                            style={{
                              width: '256px',
                              padding: '4px',
                              objectFit: 'contain',
                              margin: '10px'
                            }}
                          />
                        ))
                      ) :
                        <>
                          <img
                            key={0}
                            src={story.imageUrl}
                            alt=""
                            style={{
                              width: '256px',
                              padding: '4px',
                              objectFit: 'contain',
                              margin: '10px'
                            }}
                          />
                        </>
                      }
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}