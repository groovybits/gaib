import { useRouter } from 'next/router';
import { useEffect, useState, useRef, Key } from 'react';
import firebase from '@/config/firebaseClientInit';
import styles from '@/styles/Home.module.css';
import Link from 'next/link';
import copy from 'copy-to-clipboard';
import { NextPage, NextPageContext } from 'next';
import Head from 'next/head';

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
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [storyIds, setStoryIds] = useState(new Set());
  const [currentScene, setCurrentScene] = useState(0);


  const pageSize = process.env.NEXT_PUBLIC_FEED_PAGE_SIZE ? parseInt(process.env.NEXT_PUBLIC_FEED_PAGE_SIZE) : 8;
  // Number of stories to fetch at a time

  useEffect(() => {
    if (!baseUrl) {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const fetchStories = async () => {
    let query = firebase.firestore().collection('stories').orderBy('timestamp', 'desc');

    if (process.env.NEXT_PUBLIC_CONTINUOUS_SCROLLING === 'true') {
      // If continuous scrolling is enabled, paginate the query
      if (initialLoad) {
        query = query.limit(pageSize);
      } else if (lastVisible) {
        query = query.startAfter(lastVisible).limit(pageSize);
      }
    }

    const snapshot = await query.get();

    if (snapshot.docs.length > 0) {
      const newStories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(story => !storyIds.has(story.id));

      setStories(prevStories => [...prevStories, ...newStories]);
      setStoryIds(prevStoryIds => new Set([...prevStoryIds, ...newStories.map(story => story.id)]));
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
    }

    if (snapshot.docs.length < pageSize) {
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

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (hasMore) {
          setLoadMoreTrigger(loadMoreTrigger + 1);
        } else {
          observer.unobserve(loadMoreRef.current!);
        }
      }
    });

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [loadMoreTrigger, hasMore]);

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
    if (typeof str !== 'string') {
      return false;
    }
    try {
      const result = JSON.parse(str);
      return (typeof result === 'object' && result !== null);
    } catch (e) {
      return false;
    }
  };

  if (storyId && selectedStory) {
    // Split the story text into scenes
    const storyParts = selectedStory.text.split(/\[SCENE: \d+\]/g).map(part => part.trim().replace(/\|$/g, '')).slice(1);

    // Create a function to go to the next page
    const nextPage = () => {
      if (currentScene < storyParts.length - 1) {
        setCurrentScene(currentScene + 1);
      }
    }

    // Create a function to go to the previous page
    const previousPage = () => {
      if (currentScene > 0) {
        setCurrentScene(currentScene - 1);
      }
    }

    // Select the image for the current scene
    const imageUrl = selectedStory.imageUrls[currentScene % selectedStory.imageUrls.length];
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
      <div className={styles.feed} >
        <p className={styles.header}>{storyParts[0].replace(/\|$/g, '')}</p>
        <div className={styles.readerStory}>
          <div className={styles.header}>
            <button onClick={previousPage} className={styles.pageButton}>Previous Page</button>&nbsp;&nbsp;|&nbsp;&nbsp;
            <button onClick={nextPage} className={styles.pageButton}>Next Page</button>
          </div>
          <div className={styles.storyContent}>
            <div className={styles.storyImage}>
              <a href={imageSrc} className={styles.storyImage}><img src={imageSrc} alt={`Story Image #${currentScene}`} className={styles.storyImage} /></a>
              {(photographerUrl && photographer && !photographerUrl.includes("groovy.org")) && <p>Photo by <a href={photographerUrl}>{photographer}</a></p>}
              {(pexelsUrl && !pexelsUrl.includes("groovy.org")) && <p>Source: <a href={pexelsUrl}>Pexels</a></p>}
            </div>
            {currentScene > 0 &&
              <p className={styles.readerHeader}>{storyParts[currentScene].replace(/\|$/g, '')}</p>
            }
          </div>
        </div>
        <div className={styles.labelContainer}>
          <button onClick={() => {
            setSelectedStory(null);
            router.push('/board');
          }} className={styles.header}>Back to Stories</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Head>
        <title>GAIBs Groovy Story Board</title>
        <meta name="description" content="Explore a collection of groovy stories created with GAIB." />
        <meta property="og:title" content="GAIB's Groovy Story Board" />
        <meta property="og:description" content="Explore a collection of groovy stories created with GAIB." />
        <meta property="og:image" content={process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE ? process.env.NEXT_PUBLIC_GAIB_DEFAULT_IMAGE : 'favicon.ico'} />
        <meta property="og:url" content="https://gaib.groovy.org/board" />
      </Head>
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

            // Sample 8 images from the story's imageUrls
            const sampledImages = story.imageUrls.length > 8 ?
              story.imageUrls.filter((_: string, index: number) => index % Math.floor(story.imageUrls.length / 8) === 0) :
              story.imageUrls;

            {
              sampledImages.map((imageUrl: string, index: number) => {
                let imageSrc = imageUrl;
                if (isJsonString(imageUrl)) {
                  const image = JSON.parse(imageUrl);
                  imageSrc = image.url;
                }
                return (
                  <img key={index} src={imageSrc} alt={`Story Image #${index}`} className={styles.storyImageThumbnail} />
                );
              })
            }

            return (
              <div key={story.id} className={styles.story}>
                <a onClick={() => handleStoryClick(story.id)} className={styles.storyTitle}>{story.text.replace(/\[SCENE: \d+\]/g, '').split('|')[0]}</a>
                {/* Add the image previews here */}
                <div className={styles.imageRow}>
                  {sampledImages.map((imageUrl: string, index: number) => {
                    const image = JSON.parse(imageUrl);
                    const imageSrc = image.url;
                    return (
                      <img key={index} src={imageSrc} alt={`Story Image #${index}`} className={styles.storyImageThumbnail} />
                    );
                  })}
                </div>
                <button onClick={() => handleShareClick(story.id)}>Copy Link</button>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <button onClick={() => handleFacebookShareClick(story.id)}>Facebook Post</button>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <a href={storyUrl} >Expand</a>
                {isExpanded && (
                  <div className={styles.storyContent}>
                    {story.text.split(/\[SCENE: \d+\]/g).map((part: string, index: number) => {
                      let imageSrc = JSON.parse(story.imageUrls[index % story.imageUrls.length]).url;
                      let photographer = '';
                      let photographerUrl = '';
                      let pexelsUrl = '';
                      if (isJsonString(story.imageUrls[index % story.imageUrls.length])) {
                        const image = JSON.parse(story.imageUrls[index % story.imageUrls.length]);
                        imageSrc = image.url;
                        photographer = image.photographer;
                        photographerUrl = image.photographer_url;
                        pexelsUrl = image.pexels_url;
                      }
                      return (
                        <div key={index}>
                          <div className={styles.storyImage}>
                            <img src={imageSrc} alt="Story image" />
                            {(photographerUrl && photographer && !photographerUrl.includes("groovy.org")) && <p>Photo by <a href={photographerUrl}>{photographer}</a></p>}
                            {(pexelsUrl && !pexelsUrl.includes("groovy.org")) && <p>Source: <a href={pexelsUrl}>Pexels</a></p>}
                          </div>
                          <p>
                            {part.trim().replace(/\|$/, '')}
                            <br />
                            <br />
                          </p>
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
      {/*<div ref={loadMoreRef} />*/}
      <div className={styles.feedSection}>
        <div className={styles.feed}>
          {/*{hasMore && <button onClick={() => setLoadMoreTrigger(loadMoreTrigger + 1)} className={styles.header}>Continue Loading Stories</button>}
          &nbsp;&nbsp;|&nbsp;&nbsp;*/}
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
