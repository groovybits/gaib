import { useEffect, useState } from 'react';
import firebase from '@/config/firebaseClientInit';
import styles from '@/styles/Global.module.css';
import Link from 'next/link';

const Global = () => {
  const [stories, setStories] = useState<any[]>([]);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);

  const pageSize = 10; // Number of stories to fetch at a time

  useEffect(() => {
    const fetchStories = async () => {
      let query = firebase.firestore().collection('stories').orderBy('timestamp', 'desc').limit(pageSize);

      if (lastVisible) {
        query = query.startAfter(lastVisible);
      }

      const snapshot = await query.get();

      if (snapshot.docs.length > 0) {
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);

        setStories(prevStories => [...prevStories, ...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))]);
      } else {
        setHasMore(false);
      }
    };

    if (hasMore) {
      fetchStories();
    }
  }, [lastVisible, hasMore]);

  useEffect(() => {
    const unsubscribe = firebase.firestore().collection('stories').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
      setStories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Clean up function
    return () => {
      unsubscribe();
    };
  }, []);

  const handleStoryClick = (id: string) => {
    if (expandedStoryId === id) {
      setExpandedStoryId(null);
    } else {
      setExpandedStoryId(id);
    }
  };

  const isJsonString = (str: string) => {
    try {
      JSON.parse(str);
    } catch (e) {
      return false;
    }
    return true;
  };

  return (
    <div className={styles.feed}>
      {stories.map(story => {
        const isExpanded = story.id === expandedStoryId;

        return (
          <div key={story.id} className={styles.story}>
            <a onClick={() => handleStoryClick(story.id)} className={styles.storyTitle}>{story.text.split('|')[0]}</a>
            {isExpanded && (
              <div className={styles.storyContent}>
                <p>{story.text}</p>
                {story.imageUrls.map((imageUrl: string, index: number) => {
                  let imageSrc = imageUrl;
                  let photographer = '';
                  let photographerUrl = '';
                  let pexelsUrl = '';
                  if (isJsonString(imageUrl)) {
                    console.log(`Global: imageUrl is JSON: ${imageUrl}`);
                    const image = JSON.parse(imageUrl);
                    imageSrc = image.url;
                    photographer = image.photographer;
                    photographerUrl = image.photographer_url;
                    pexelsUrl = image.pexels_url;
                  }
                  return (
                    <div key={index} className={styles.storyImage}>
                      <img src={imageSrc} alt="Story image" />
                      {photographer && <p>Photo by <a href={photographerUrl}>{photographer}</a></p>}
                      {pexelsUrl && <p>Source: <a href={pexelsUrl}>Pexels</a></p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {hasMore && <button onClick={() => setLastVisible(lastVisible)}>Load more</button>}
      <div className={styles.labelContainer}>
        <Link href="/" className={styles.header}>
          <a>Back to GAIB</a>
        </Link>
      </div>
    </div>
  );
};

export default Global;