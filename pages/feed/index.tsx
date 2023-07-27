import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import styles from '@/styles/Home.module.css';
import { useRouter } from 'next/router';

export type Story = {
  id: string;
  text: string;
  timestamp: number;
  imageUrls: string[];
  thumbnailUrl?: string;
};

export default function Feed() {
  const [stories, setStories] = useState<Story[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null); // State for the currently expanded story
  const router = useRouter();
  const observer = useRef<IntersectionObserver | null>(null);
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
    [nextPageToken]
  );

  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    const tokenParam = nextPageToken ? `&pageToken=${nextPageToken}` : '';
    const response = await fetch(`/api/stories?maxResults=20${tokenParam}`);
    const data = await response.json();
    setStories((prevStories) => [...prevStories, ...data.stories]);
    setNextPageToken(data.nextPageToken);
  };

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
  };

  const handleFacebookShareClick = (storyId: string) => {
    const id = storyId.split('/')[1]; // Extract the id from the storyId string
    const url = `${window.location.origin}/${id}`;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  };

  // Helper function to format the story text
  const formatStoryText = (text: string) => {
    // Remove ```bash and other similar markers
    text = text.replace(/```.*\n/g, '');

    // Remove "|" pipes
    text = text.replace(/\|/g, '');

    // Split the text by the [SCENE: <number>] markers
    const scenes = text.split(/\[SCENE: \d+\]/g);

    // Join them back together with paragraph breaks
    return scenes.join('\n\n');
  };

  return (
    <div className={styles.container}>
      <div className={styles.feedSection}>
        <div className={styles.feed}>
          {stories.map((story, index) => {
            const thumbnailSrc = story.thumbnailUrl || JSON.parse(story.imageUrls[0]).url; // Use thumbnail if it exists, else use the first image
            const dateString = new Date(story.timestamp).toLocaleDateString();

            if (stories.length === index + 1) {
              return (
                <div ref={lastStoryElementRef} key={story.id} className={styles.story}>
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
                  <p className={styles.storyTimestamp}>{dateString}</p>
                  <div className={styles.shareButtons}>
                    <button onClick={() => handleShareClick(story.id)}>Copy Link</button>
                    <button onClick={() => handleFacebookShareClick(story.id)}>Share on Facebook</button>
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
                    <button onClick={() => handleShareClick(story.id)}>Copy Link</button>
                    <button onClick={() => handleFacebookShareClick(story.id)}>Share on Facebook</button>
                    {/* Add other social media share buttons here */}
                  </div>
                  {expandedStoryId === story.id && (
                    <div>
                      {/* Add the expanded view content here */}
                      {expandedStoryId === story.id && (
                        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '24px' }}>
                          <p>{formatStoryText(story.text)}</p>
                          <div style={{ display: 'flex', flexDirection: 'row', overflowX: 'scroll' }}>
                            {story.imageUrls.map((imageUrl, index) => (
                              <img
                                key={index}
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
