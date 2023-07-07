import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import firebase from '@/config/firebaseClientInit';
import styles from '@/styles/Global.module.css';
import Link from 'next/link';
import copy from 'copy-to-clipboard';
import { NextPage, NextPageContext } from 'next';

interface Story {
  id: string;
  text: string;
  imageUrls: string[];
  timestamp: firebase.firestore.Timestamp;
  // Add other properties of the story object here
}

interface InitialProps {
  initialStory: Story | null;
}

const Global: NextPage<InitialProps> = ({ initialStory }) => {
  const router = useRouter();
  const { storyId } = router.query;
  const [selectedStory, setSelectedStory] = useState(initialStory);

  const [stories, setStories] = useState<any[]>([]);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [baseUrl, setBaseUrl] = useState(process.env.NEXT_PUBLIC_BASE_URL || '');
  const [loadMoreTrigger, setLoadMoreTrigger] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);

  const pageSize = process.env.NEXT_PUBLIC_FEED_PAGE_SIZE ? parseInt(process.env.NEXT_PUBLIC_FEED_PAGE_SIZE) : 10;
  // Number of stories to fetch at a time

  useEffect(() => {
    if (!baseUrl) {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const fetchStories = async () => {
    let query = firebase.firestore().collection('stories').orderBy('timestamp', 'desc');

    if (initialLoad) {
      query = query.limit(pageSize);
    } else if (lastVisible) {
      query = query.startAfter(lastVisible).limit(pageSize);
    }

    const snapshot = await query.get();

    if (snapshot.docs.length > 0) {
      setStories(prevStories => [...prevStories, ...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
    } else {
      setHasMore(false);
    }

    if (initialLoad) {
      setInitialLoad(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, [loadMoreTrigger]);

  useEffect(() => {
    if (storyId) {
      const fetchStory = async () => {
        const doc = await firebase.firestore().collection('stories').doc(storyId as string).get();
        if (doc.exists) {
          setSelectedStory({ id: doc.id, ...(doc.data() as any) }); // Cast to any to avoid TypeScript error
        }
      };

      fetchStory();
    } else {
      setSelectedStory(null); // Reset the selected story when storyId is not present
    }
  }, [storyId]); // Add storyId as a dependency to the effect

  const handleShareClick = (storyId: string) => {
    copy(`${baseUrl}/${storyId}`);
  };

  const handleFacebookShareClick = (storyId: string) => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${baseUrl}/${storyId}`)}`, '_blank');
  };

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

  if (storyId && selectedStory) {
    const storyParts = selectedStory.text.replace(/\[SCENE: \d+\]/g, '').split('|');
    const images = selectedStory.imageUrls.map((imageUrl: string, index: number) => {
      let imageSrc = imageUrl;
      let photographer = '';
      let photographerUrl = '';
      let pexelsUrl = '';
      if (isJsonString(imageUrl)) {
        const image = JSON.parse(imageUrl);
        imageSrc = image.url;
        photographer = image.photographer;
        photographerUrl = image.photographer_url;
        pexelsUrl = image.pexels_url;
      }
      return (
        <div key={index} className={styles.storyImage}>
          <a href={imageSrc} className={styles.storyImage}><img src={imageSrc} alt={`Story Image #${index}`} className={styles.storyImage} /></a>
          {photographer && <p>Photo by <a href={photographerUrl}>{photographer}</a></p>}
          {pexelsUrl && <p>Source: <a href={pexelsUrl}>Pexels</a></p>}
        </div>
      );
    });

    return (
      <div className={styles.feed} >
        <div className={styles.labelContainer}>
          <button onClick={() => {
            setSelectedStory(null);
            router.push('/board');
          }} className={styles.header}>Back to Stories</button>
        </div>
        <div className={styles.story}>
          <div className={styles.header}>
            <h1>{storyParts[0]}</h1>
          </div>
          <div className={styles.story}>
          {storyParts.slice(1).map((part: string, index: number) => (
          <div key={index} className={styles.storyContent}>
            <p className={styles.header}>{part}</p>
            <div className={styles.storyImage}>
              {images[index]}
            </div>
          </div>
          ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.feed}>
        <div className={styles.header}>
          <Link href="/" className={styles.header}>
            <a>GAIBs Groovy Story Board</a>
          </Link>
        </div>

        <div className={styles.labelContainer}>
        {stories.map(story => {
          const isExpanded = story.id === expandedStoryId;
          const storyUrl = `${baseUrl}/${story.id}`;

          return (
            <div key={story.id} className={styles.story}>
              <a onClick={() => handleStoryClick(story.id)} className={styles.storyTitle}>{story.text.replace(/\[SCENE: \d+\]/g, '').split('|')[0]}</a>
              &nbsp;&nbsp;|&nbsp;&nbsp;
              <button onClick={() => handleShareClick(story.id)}>Copy Link</button>
              &nbsp;&nbsp;|&nbsp;&nbsp;
              <button onClick={() => handleFacebookShareClick(story.id)}>Facebook Post</button>
              &nbsp;&nbsp;|&nbsp;&nbsp;
              <a href={storyUrl} >Expand</a>
              &nbsp;&nbsp;|&nbsp;&nbsp;
              {isExpanded && (
                <div className={styles.storyContent}>
                  <p>{story.text}</p>
                  {story.imageUrls.map((imageUrl: string, index: number) => {
                    let imageSrc = imageUrl;
                    let photographer = '';
                    let photographerUrl = '';
                    let pexelsUrl = '';
                    if (isJsonString(imageUrl)) {
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
        </div>
      </div>
      <div className={styles.feedSection}>
        <div className={styles.labelContainer}>
          {hasMore && <button onClick={() => setLoadMoreTrigger(loadMoreTrigger + 1)} className={styles.header}>Load more Stories</button>}
        &nbsp;&nbsp;|&nbsp;&nbsp;
          <Link href="/" className={styles.header}>
            <a>Create a Story with GAIB</a>
          </Link>
          </div>
          <div className={styles.footer}>
          <div className={styles.footerContainer}>
            <a href="https://groovy.org">The Groovy Organization</a>&nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="https://github.com/groovybits/gaib">github.com/groovybits/gaib</a>
          </div>
        </div>
      </div>
    </div>
  );
};

Global.getInitialProps = async ({ query }: NextPageContext) => {
  const { storyId } = query as { storyId?: string };
  let initialStory = null;

  if (storyId) {
    const doc = await firebase.firestore().collection('stories').doc(storyId).get();
    if (doc.exists) {
      initialStory = { id: doc.id, ...(doc.data() as any) }; // Cast to any to avoid TypeScript error
    }
  }

  return { initialStory };
};

export default Global;
