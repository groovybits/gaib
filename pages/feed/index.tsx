import { useState, useEffect } from 'react';
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
  const router = useRouter();

  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    const response = await fetch(`/api/stories?nextPageToken=${nextPageToken || ''}`);
    const data = await response.json();
    setStories([...stories, ...data.stories]);
    setNextPageToken(data.nextPageToken);
  };

  const handleStoryClick = (storyId: string) => {
    router.push(`/stories/${storyId}`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.feedSection}>
        <div className={styles.feed}>
          {stories.map((story) => {
            const thumbnailSrc = story.thumbnailUrl || JSON.parse(story.imageUrls[0]).url; // Use thumbnail if it exists, else use the first image
            const dateString = new Date(story.timestamp).toLocaleDateString();

            return (
              <div key={story.id} className={styles.story}>
                <a onClick={() => handleStoryClick(story.id)} className={styles.storyTitle}>
                  <img
                    src={thumbnailSrc}
                    alt=""
                    className={styles.storyImageThumbnailTitle}
                    style={{
                      width: '100px',  // Set the width you want
                      height: '100px',  // Set the height you want
                      objectFit: 'contain'
                    }}
                  /> {/* Thumbnail image here */}
                  {story.text.replace(/\[SCENE: \d+\]/g, '').split('|')[0]}
                </a>
                <p className={styles.storyTimestamp}>{dateString}</p>
                {/* Add other elements here */}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
