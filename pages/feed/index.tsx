import { useState, useEffect, useRef, useCallback } from 'react';
import styles from '@/styles/Home.module.css';
import nlp from 'compromise';
import Head from 'next/head';

export type Story = {
  id: string;
  text: string;
  timestamp: number;
  imageUrls: string[];
  thumbnailUrl?: string;
};

const adSenseCode = process.env.NEXT_PUBLIC_ADSENSE_PUB_ID ? process.env.NEXT_PUBLIC_ADSENSE_PUB_ID : '';
const gaibImage = process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE ? process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE : '';

export default function Feed() {
  const [stories, setStories] = useState<Story[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null); // State for the currently expanded story
  const observer = useRef<IntersectionObserver | null>(null);

  const fetchStories = useCallback(async () => {
    const tokenParam = nextPageToken ? `&pageToken=${nextPageToken}` : '';
    const response = await fetch(`/api/stories?maxResults=20${tokenParam}`);
    const data = await response.json();
    setStories((prevStories) => [...prevStories, ...data.stories]);
    setNextPageToken(data.nextPageToken);
  }, [nextPageToken]);

  const lastStoryElementRef = useCallback(
    (node: any) => {
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && nextPageToken) {
          fetchStories();
        }
      });
      if (node) observer.current.observe(node);
    },
    [nextPageToken, fetchStories]
  );

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
    const id = storyId.split('/')[1]; // Extract the id from the storyId string
    const url = `${window.location.origin}/${id}`;
    navigator.clipboard.writeText(url);
    alert(`Copied ${url} to clipboard!`);
  };

  const handleFacebookShareClick = (storyId: string) => {
    const id = storyId.split('/')[1]; // Extract the id from the storyId string
    const url = `${window.location.origin}/${id}`;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  };

  const handleLinkedInShareClick = (storyId: string) => {
    const id = storyId.split('/')[1]; // Extract the id from the storyId string
    const url = `${window.location.origin}/${id}`;
    window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}`, '_blank');
  };

  const handleTwitterShareClick = (storyId: string) => {
    const id = storyId.split('/')[1]; // Extract the id from the storyId string
    const url = `${window.location.origin}/${id}`;
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`, '_blank');
  };

  // Helper function to format the story text
  const formatStoryText = (text: string) => {
    // Remove ```bash and other similar markers
    text = text.replace(/```.*\n/g, '');

    // Remove "|" pipes
    text = text.replace(/\|/g, '');

    // Split the text by the [SCENE: <number>] markers
    const scenes = text.split(/\[SCENE: \d+\]/g);

    // Split each scene into paragraphs and list items
    const formattedScenes = scenes.map((scene, sceneIndex) => {
      const paragraphs = scene.split(/\n\s*\n/);
      const formattedParagraphs = paragraphs.map((paragraph, paragraphIndex) => {
        if (paragraph.startsWith('1. ')) {
          const listItems = paragraph.split('\n');
          return listItems.map((item, index) => `${item}\n`).join('');
        } else {
          const doc = nlp(paragraph);
          const sentences = doc.sentences().out('array');
          return sentences.join('\n') + '\n\n';
        }
      });
      return formattedParagraphs.join('');
    });

    return formattedScenes.join('');
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
        <div className={styles.topHeader}>
          <h1>Groovy</h1>
        </div>
        <div className={styles.feed}>
          {stories.map((story, index) => {
            const thumbnailSrc = story.thumbnailUrl || JSON.parse(story.imageUrls[0]).url; // Use thumbnail if it exists, else use the first image
            const dateString = new Date(story.timestamp).toLocaleDateString();

            if (stories.length === index + 1) {
              return (
                <div ref={lastStoryElementRef} key={story.id} className={styles.story}>
                  <p className={styles.storyTimestamp}>{dateString}</p>
                  <a onClick={() => handleStoryClick(story.id)} className={styles.storyTitle}>
                    <img
                      src={thumbnailSrc}
                      alt=""
                      className={styles.storyImageThumbnailTitle}
                      style={{
                        width: '128px',  // Set the width you want
                        /*height: '128px',*/  // Set the height you want
                        padding: '4px',
                        objectFit: 'contain'
                      }}
                    /> {/* Thumbnail image here */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {story.text.replace(/\[SCENE: \d+\]/g, '').split('|')[0]}
                    </div>
                  </a>
                  <div className={styles.shareButtons}>                    
                    <a href={`/${story.id.split('/')[1]}`} target="_blank" rel="noopener noreferrer">View Story</a>
                    <button onClick={() => handleShareClick(story.id)}>Copy Link</button>
                    <button onClick={() => handleFacebookShareClick(story.id)}>Share on Facebook</button>
                    <button onClick={() => handleLinkedInShareClick(story.id)}>Share on LinkedIn</button>
                    <button onClick={() => handleTwitterShareClick(story.id)}>Share on Twitter</button>
                    {/* Add other social media share buttons here */}
                  </div>
                  {expandedStoryId === story.id && (
                    <div>
                      {/* Add the expanded view content here */}
                    </div>
                  )}
                </div>
              );
            } else {
              return (
                <div key={story.id} className={styles.story}>
                  <a onClick={() => handleStoryClick(story.id)} className={styles.storyTitle}>
                    <img
                      src={thumbnailSrc}
                      alt=""
                      className={styles.storyImageThumbnailTitle}
                      style={{
                        width: '128px',  // Set the width you want
                        /*height: '128px',*/  // Set the height you want
                        padding: '4px',
                        objectFit: 'contain'
                      }}
                    /> {/* Thumbnail image here */}
                    <div style={{ display: 'flex', flexDirection: 'column', fontSize: '18px' }}>
                      {story.text.replace(/\[SCENE: \d+\]/g, '').split('|')[0]}
                    </div>
                  </a>
                  <div className={styles.shareButtons}>
                    <p className={styles.storyTimestamp}>{dateString}</p>
                    <a href={`/${story.id.split('/')[1]}`} target="_blank" rel="noopener noreferrer">View Story</a>
                    <button onClick={() => handleShareClick(story.id)}>Copy Link</button>
                    <button onClick={() => handleFacebookShareClick(story.id)}>Share on Facebook</button>
                    <button onClick={() => handleLinkedInShareClick(story.id)}>Share on LinkedIn</button>
                    <button onClick={() => handleTwitterShareClick(story.id)}>Share on Twitter</button>
                    {/* Add other social media share buttons here */}
                  </div>
                  {expandedStoryId === story.id && (
                    <div>
                      {/* Add the expanded view content here */}
                      {expandedStoryId === story.id && (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          fontSize: '24px',
                          maxHeight: '90vh', // 90% of the viewport height
                          maxWidth: '90vw', // 90% of the viewport width
                          overflowY: 'auto', // Enable vertical scrolling if necessary
                          overflowX: 'hidden' // Prevent horizontal scrolling
                        }}>                          <p style={{ /* plain text white space */ whiteSpace: 'pre-wrap' }}>
                            {formatStoryText(story.text.slice(0, 5000))} (Click on the story to read more)
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'row', overflowX: 'scroll' }}>
                            {story.imageUrls.map((imageUrl, index) => (
                              <img
                                key={index} // Add this line
                                src={JSON.parse(imageUrl).url}
                                alt=""
                                style={{
                                  width: '256px',  // Set the width you want
                                  /*height: '256px',*/  // Set the height you want
                                  padding: '4px',
                                  objectFit: 'contain',
                                  margin: '10px'
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }
          })}
        </div>
      </div>
    </div>
  );
}
