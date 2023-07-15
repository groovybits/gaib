import { useRouter } from 'next/router';
import { useEffect, useState, useRef, Key } from 'react';
import firebase from '@/config/firebaseClientInit';
import styles from '@/styles/Home.module.css';
import Link from 'next/link';
import copy from 'copy-to-clipboard';
import { NextPage, NextPageContext } from 'next';
import Head from 'next/head';
import PexelsCredit from '@/components/PexelsCredit'; // Update the path if required
import { type } from 'os';
import { ParsedUrlQuery } from 'querystring';

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
  const { storyId }: ParsedUrlQuery = router.query;
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
  const [isFullScreen, setIsFullScreen] = useState(false);

  const pageSize = process.env.NEXT_PUBLIC_FEED_PAGE_SIZE ? parseInt(process.env.NEXT_PUBLIC_FEED_PAGE_SIZE) : 8;
  const debug = process.env.DEBUG === 'true' ? true : false; // Debug mode
  // Number of stories to fetch at a time

  useEffect(() => {
    if (!baseUrl) {
      setBaseUrl(window.location.origin);
    }
  }, [baseUrl]);

  const fetchStories = async () => {
    let query;
    let useImages = false;

    if (debug) {
      console.log(`Router query: ${storyId}`);
    }
    // Check the current route
    if (storyId === 'images') {
      // If the current route is '/images', fetch from the 'images' collection
      query = firebase.firestore().collection('images').orderBy('count', 'desc').orderBy('created', 'desc');
      useImages = true;
    } else if (storyId && typeof storyId === 'string' && storyId.startsWith('images')) {
      // If the current route is '/images/episodeId', fetch from the 'images' collection
      const episodeId = storyId.replace('images', ''); // Extract the episodeId from the route
      query = firebase.firestore().collection('images').where('episodeId', '==', episodeId).orderBy('count', 'desc').orderBy('created', 'desc');
      useImages = true;
    } else {
      // Otherwise, fetch from the 'stories' collection
      query = firebase.firestore().collection('stories').orderBy('timestamp', 'desc');
    }

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
      let newStories: any[];

      if (useImages) {
        // Group images by episodeId to form stories
        const storiesMap: { [key: string]: any } = {};
        let count = 1;
        snapshot.docs.forEach(doc => {
          const image = doc.data();
          let imageObject;
          if (typeof image.url === 'string') {
            // If it's not JSON, assume it's a string and create an object with a single property
            imageObject = { url: image.url, photographer: '', photographer_url: '', pexels_url: '' };
          } else if (typeof image.url === 'object') {
            // If image.url is already an object, assign it directly to imageObject
            imageObject = image.url;
          } else {
            // If image.url is neither a string nor an object, create an object with a single property
            imageObject = { url: image.url, photographer: '', photographer_url: '', pexels_url: '' };
          }
          if (!storiesMap[image.episodeId]) {
            storiesMap[image.episodeId] = {
              userId: "unknown",
              id: image.episodeId,
              text: `[SCENE: 1] ${image.keywords.join('| [SCENE: 1] ')}`,
              imageUrls: [JSON.stringify(imageObject)],
              timestamp: image.created,
            };
          } else {
            count += 1;
            storiesMap[image.episodeId].imageUrls.push(JSON.stringify(imageObject));
            storiesMap[image.episodeId].text += `| [SCENE: ${count}] ${image.keywords.join(`| [SCENE: ${count}] `)}`;
          }
        });

        if (debug) {
          console.log(`Stories map: ${JSON.stringify(storiesMap)}`);
        }

        newStories = Object.values(storiesMap).filter(story => !storyIds.has(story.id));
      } else {
        newStories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(story => !storyIds.has(story.id));
      }

      if (debug) {
        console.log(`New stories: ${JSON.stringify(newStories)}`);
      }

      setStories(prevStories => [...prevStories, ...newStories]);
      setStoryIds(prevStoryIds => new Set([...prevStoryIds, ...newStories.map((story: any) => story.id)]));
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
  }, [storyId, loadMoreTrigger]);

  useEffect(() => {
    if (storyId && storyId !== 'images' && storyId !== 'board' && typeof storyId === 'string') {
      const fetchStory = async () => {
        let doc;
        if (storyId.startsWith('images')) {
          // If the storyId starts with 'images', fetch from the 'images' collection
          const episodeId = storyId.replace('images', ''); // Extract the episodeId from the route
          doc = await firebase.firestore().collection('images').where('episodeId', '==', episodeId).get();
        } else {
          // Otherwise, fetch from the 'stories' collection
          doc = await firebase.firestore().collection('stories').doc(storyId).get();
        }

        if (doc instanceof firebase.firestore.QuerySnapshot) {
          // Handle the case where doc is a QuerySnapshot
          const storiesMap: { [key: string]: any } = {};
          let count = 1;
          doc.docs.forEach(doc => {
            const image = doc.data();
            let imageObject;
            if (typeof image.url === 'string') {
              // If it's not JSON, assume it's a string and create an object with a single property
              imageObject = { url: image.url, photographer: '', photographer_url: '', pexels_url: '' };
            } else if (typeof image.url === 'object') {
              // If image.url is already an object, assign it directly to imageObject
              imageObject = image.url;
            } else {
              // If image.url is neither a string nor an object, create an object with a single property
              imageObject = { url: image.url, photographer: '', photographer_url: '', pexels_url: '' };
            }
            if (!storiesMap[image.episodeId]) {
              storiesMap[image.episodeId] = {
                userId: "unknown",
                id: image.episodeId,
                text: `[SCENE: 1] ${image.keywords.join('| [SCENE: 1] ')}`,
                imageUrls: [JSON.stringify(imageObject)],
                timestamp: image.created,
              };
            } else {
              count += 1;
              storiesMap[image.episodeId].imageUrls.push(JSON.stringify(imageObject));
              storiesMap[image.episodeId].text += `| [SCENE: ${count}] ${image.keywords.join(`| [SCENE: ${count}] `)}`;
            }
          });
          setSelectedStory(Object.values(storiesMap)[0]); // Select the first story
        } else if (doc.exists) {
          // Handle the case where doc is a DocumentSnapshot
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

  const handleShareClick = (storyId: string | string[]) => {
    copy(`${baseUrl}/${storyId}`);
  };

  const handleFacebookShareClick = (storyId: string | string[]) => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${baseUrl}/${storyId}`)}`, '_blank');
  };

  const handleStoryClick = (id: string) => {
    if (expandedStoryId === id) {
      setExpandedStoryId(null);
    } else {
      setExpandedStoryId(id);
    }
  };

  // toggle the full screen state
  const toggleFullScreen = () => {
    const imageContainer = document.querySelector(`.${styles.imageContainer}`);
    const image = document.querySelector(`.${styles.generatedImage} img`);

    if (!document.fullscreenElement) {
      if (imageContainer?.requestFullscreen) {
        imageContainer.requestFullscreen();
        image?.classList.add(styles.fullScreenImage);
        setIsFullScreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        image?.classList.remove(styles.fullScreenImage);
        setIsFullScreen(false);
      }
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
    let imageShare = imageUrl;
    const defaultImageDir = process.env.NEXT_PUBLIC_GAIB_IMAGE_DIRECTORY_URL ? process.env.NEXT_PUBLIC_GAIB_IMAGE_DIRECTORY_URL : '/gaib/images/';

    // find first image that isn't the default, else use the default found as first image
    // default image is public.env.NEXT_PUBLIC_GAIB_IMAGE_DIRECTORY_URL
    try {
      for (let i = 0; i < selectedStory.imageUrls.length; i++) {
        if (isJsonString(selectedStory.imageUrls[i])) {
          const image = JSON.parse(selectedStory.imageUrls[i]);
          if (image.url && !image.url.includes(defaultImageDir)) {
            imageShare = image.url;
            break;
          }
        } else {
          if (selectedStory.imageUrls[i] && !selectedStory.imageUrls[i].includes(defaultImageDir)) {
            imageShare = selectedStory.imageUrls[i];
            break;
          }
        }
      }
    } catch (e) {
      console.log(`Error finding image: ${e}`);
    }

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
      <div className={styles.cloud} >
        <Head>
          <title>{storyParts[0].replace(/\|$/g, '')}</title>
          <meta name="description" content={storyParts[1] ? storyParts.slice(1).join(' ').slice(0, 500) : storyParts[0]} />
          <meta property="og:title" content={storyParts[0].replace(/\|$/g, '')} />
          <meta property="og:description" content={storyParts[1] ? storyParts.slice(1).join(' ').slice(0, 500) : storyParts[0]} />
          <meta property="og:image" content={imageShare} />
          <meta property="og:url" content={`https://gaib.groovy.org/${storyId}`} />
        </Head>
        <div className={styles.readerStory}>
          <div
            className={styles.imageContainer}
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
            <button
              type="button"
              className={styles.fullscreenButton}
              onClick={toggleFullScreen}
            >
              {isFullScreen ? "Exit Full Screen" : "Full Screen"}
            </button>
            <div className={styles.footer}>
              <button onClick={previousPage} className={styles.pageButton}>Previous Page</button>&nbsp;&nbsp;|&nbsp;&nbsp;
              {!isFullScreen ? (
                <>
                  <button onClick={() => {
                    setSelectedStory(null);
                    if (storyId.toString().startsWith('images')) {
                      router.push('/images');
                    } else {
                      router.push('/board');
                    }
                  }} className={styles.header}>Back to Stories</button> &nbsp;&nbsp;|&nbsp;&nbsp;
                </>
              ) : (
                <></>
              )}
              <button onClick={nextPage} className={styles.pageButton}>Next Page</button>
            </div>
            <div className={styles.generatedImage}>
              {(imageSrc === '') ? "" : (
                <>
                  <img
                    src={imageSrc}
                    alt="GAIB"
                  />
                </>
              )}
              <div className={
                isFullScreen ? styles.fullScreenSubtitle : styles.subtitle
              }>{storyParts[currentScene].replace(/\|$/g, '')}
              </div>
              {(imageSrc === '' || (process.env.NEXT_PUBLIC_IMAGE_SERVICE != "pexels")) ? "" : (
                <div>
                  <PexelsCredit photographer={photographer} photographerUrl={photographerUrl} pexelsUrl={pexelsUrl} />
                </div>
              )}
              <button onClick={() => handleShareClick(storyId)}>Copy Link</button>
              &nbsp;&nbsp;|&nbsp;&nbsp;
              <button onClick={() => handleFacebookShareClick(storyId)}>Facebook Post</button>
            </div>
          </div>
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

            // Convert the Firestore timestamp to a JavaScript Date object
            const date = story.timestamp ? story.timestamp.toDate() : story.created ? story.created.toDate() : new Date();

            // Format the date to a human-readable string
            const dateString = date.toLocaleString();

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
                <button onClick={() => handleShareClick(`${storyId?.toString().startsWith('images') ? 'images' + story.id : story.id}`)}>Copy Link</button>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <button onClick={() => handleFacebookShareClick(`${storyId?.toString().startsWith('images') ? 'images' + story.id : story.id}`)}>Facebook Post</button>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <a href={storyId === 'images' ? `${baseUrl}/images${story.id}` : storyUrl}>Expand</a>
                <p className={styles.storyTimestamp}>{dateString}</p>
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
                          {/*<div className={styles.storyImage}>
                            {<img src={imageSrc} alt="Story image" />
                            {(photographerUrl && photographer && !photographerUrl.includes("groovy.org")) && <p>Photo by <a href={photographerUrl}>{photographer}</a></p>}
                            {(pexelsUrl && !pexelsUrl.includes("groovy.org")) && <p>Source: <a href={pexelsUrl}>Pexels</a></p>}
                          </div>*/}
                          <p>
                            {part.trim().replace(/\|$/, '')}
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
  const { storyId, episodeId } = query as { storyId?: string, episodeId?: string };
  let initialStory = null;

  if (storyId === 'images' && episodeId) {
    const doc = await firebase.firestore().collection('images').doc(episodeId).get();
    if (doc.exists) {
      initialStory = { id: doc.id, ...(doc.data() as any) }; // Cast to any to avoid TypeScript error
    }
  } else if (storyId) {
    const doc = await firebase.firestore().collection('stories').doc(storyId).get();
    if (doc.exists) {
      initialStory = { id: doc.id, ...(doc.data() as any) }; // Cast to any to avoid TypeScript error
    }
  }

  return { initialStory };
};

export default Global;
