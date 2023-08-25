import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState, use } from 'react';
import * as PIXI from 'pixi.js';
import { TextStyle, Text, Sprite } from 'pixi.js';
import { Story, Scene } from '@/types/story';
import { set } from 'lodash';

export interface AnimateStoryProps {
  story: Story | null;
  defaultImage: string;
  defaultSubtitle: string;
  onCompletion?: () => void;
}

export interface AnimateStoryHandle {
  isPlaybackInProgress: () => boolean;
  startPlayback: () => void;
  stopPlayback: () => void;
}

const AnimateStory = forwardRef<AnimateStoryHandle, AnimateStoryProps>((props, ref): JSX.Element | null => {
  const faceContainerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef(new Audio());
  const appRef = useRef<PIXI.Application | null>(null);
  const subtitleTextRef = useRef<PIXI.Text | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null); // Ref to store the video element
  const isPlaybackInProgressRef = useRef(false);
  const spriteRef = useRef<PIXI.Sprite | null>(null);
  const isVideoRef = useRef(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoReadyRef = useRef(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentText, setCurrentText] = useState('');
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const loaderRef = useRef<PIXI.Loader | null>(null);

  const loader: PIXI.Loader = PIXI.Loader.shared;
  loaderRef.current = loader;
  loaderRef.current.onError.add((error) => console.error('Error loading resources:', error));

  // Initialize PixiJS application
  if (!faceContainerRef.current) {
    console.error(`AnimateStory: Container not found, Story Image: ${props.story ? props.story?.imageUrl : props.defaultImage}, defaultImage: ${props.defaultImage}, defaultSubtitle: ${props.defaultSubtitle} Scenes Length: ${props.story && props.story.scenes ? props.story?.scenes?.length : ''}`);
  }

  const startPlayback = () => {
    // Logic to start playing the story
    console.log(`startPlayback: Playing ${props.story ? props.story.title : ''} ${props.story && props.story.scenes ? props.story.scenes.length : ''} scenes.`);
    playStory(props.story as Story);
  };

  const stopPlayback = () => {
    // Logic to stop playing the story
    stopSpeaking();
    stopVideo();
  };

  // Expose the isPlaybackInProgress method
  useImperativeHandle(ref, () => ({
    isPlaybackInProgress: () => isPlaybackInProgressRef.current,
    startPlayback: () => startPlayback(),
    stopPlayback: () => stopPlayback(),
  }));

  const pauseSpeaking = async () => {
    if (audioRef.current) {
      console.log(`pauseSpeaking: Pausing audio playback`);
      audioRef.current.pause();
    }
  };

  const resumeSpeaking = async () => {
    if (audioRef.current) {
      console.log(`resumeSpeaking: Resuming audio playback`);
      audioRef.current.play();
    }
  };

  const stopSpeaking = async () => {
    if (audioRef.current) {
      console.log(`stopSpeaking: Stopping audio playback`);
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  // Custom function to play the video
  const playVideo = async () => {
    if (videoElementRef.current) {
      await videoElementRef.current.play().then(() => {
        setIsVideoPlaying(true);
        console.log('Video started playing');
      }).catch((error) => {
        console.error('Error playing video:', error);
      });
    }
  };

  const pauseVideo = async () => {
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      console.log('Video paused');
    }
  };

  const stopVideo = async () => {
    if (videoElementRef.current) {
      videoElementRef.current.pause()
      videoElementRef.current.currentTime = 0;
      setIsVideoPlaying(false);
      console.log('Video stopped');
    }
  }

  // Playback only from an audio url
  const playAudio = async (audioUrl: string): Promise<void> => {
    return new Promise(async (resolve) => {
      try {
        if (audioRef.current && !audioRef.current.paused) {
          console.log('Audio is already playing');
          resolve();
          throw new Error('Audio is already playing');
        }

        if (typeof window === 'undefined') {
          console.log('Audio playback is not available in this environment');
          resolve();
          throw new Error('Audio playback is not available in this environment');
        }

        if (videoElementRef.current && isVideoRef.current) {
          console.log('Attempting to play video...');

          // Check if the video is ready to play
          playVideo();
        } else {
          console.log(`Video is not available, playing only audio isVideoRef: ${isVideoRef.current ? "true" : "false"} videoElementRef: ${videoElementRef.current ? "set" : "unset"}...`)
        }

        // Playback the audio using the browser's built-in capabilities.
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.play();

        audio.addEventListener(
          'ended',
          () => {
            if (isVideoRef.current) { // Check if the video is playing
              pauseVideo();
            } else if (isVideoRef.current && videoElementRef.current) {
              console.error(`Audio Ended: Video is not playing. isVideoPlaying: ${isVideoPlaying}, isVIdeoRef: ${isVideoRef.current}`);
            }
            resolve();
          },
          false
        );
      } catch (error) {
        console.error('Error in playing audio, error:', error);
        resolve();
        throw error;
      }
    });
  };

  // Playback audio and subtitle + image or video
  const playAudioAndSubtitle = async (audioFile: string, subtitle: string, imageUrl?: string) => {
    return new Promise<void>(async (resolve) => {
      // Update the text without removing and adding to the stage
      if (subtitleTextRef.current) {
        subtitleTextRef.current.text = subtitle;
      }

      // Update the image or video
      if (imageUrl && imageUrl !== '') {
        if (isVideoRef.current && videoElementRef.current) {
          // switch out the video if it's different
          if (imageUrl != currentUrl) {
            setupVideoOrImage(imageUrl);
          }
        } else {
          // switch out the image if it's different
          if (imageUrl != currentUrl && spriteRef.current) {
            const texture = PIXI.Texture.from(imageUrl);
            spriteRef.current.texture = texture;
            spriteRef.current.texture.update();
          }
        }
      }

      await playAudio(audioFile)
        .then(() => resolve())
        .catch((error) => {
          console.error('Error playing audio:', error);
          resolve();
        });
    });
  };

  // Playback a Scene from the story
  const playScene = (scene: Scene) => {
    return scene.sentences.reduce((promise, sentence) => {
      return promise.then(() => playAudioAndSubtitle(sentence.audioFile, sentence.text, sentence.imageUrl || props.defaultImage));
    }, Promise.resolve());
  };

  const playStory = async (story: Story): Promise<boolean> => {
    if (props.story && props.story?.scenes) {
      console.log(`playScene: Playing ${props.story ? props.story.title : ''} ${props.story && props.story.scenes ? props.story.scenes.length : ''} scenes.`);
      (async () => {
        if (props.story) {
          isPlaybackInProgressRef.current = true;
          for (const scene of props.story.scenes) {
            console.log(`playScene: Playing ${props.story ? props.story.title : ''} scene ${scene ? scene.id : ''} of ${props.story && props.story.scenes ? props.story.scenes.length : ''} scenes.`);
            await playScene(scene);
          }

          // Reset the image and text to defaults
          if (isVideoRef.current && videoElementRef.current) {
            await stopVideo();
          }

          if (subtitleTextRef.current) {
            subtitleTextRef.current.text = props.defaultSubtitle;
          }
          console.log(`playScene: Finished playing ${props.story ? props.story.title : ''} ${props.story && props.story.scenes ? props.story.scenes.length : ''} scenes.`);

          // Call the onCompletion callback
          props.onCompletion?.();

          isPlaybackInProgressRef.current = false;
        } else {
          console.error(`playScene: story is null`);
        }
      })();
      return true;
    } else {
      console.error(`playStory: story.scenes is null or empty`);
      return false;
    }
  };

  // Playback the story
  useEffect(() => {
    const play = async () => {
      if (!isPlaybackInProgressRef.current && props.story && props.story.scenes) {
        await playStory(props.story as Story);
      } else {
        console.log(`play: playback ${isPlaybackInProgressRef ? "on" : "off"}.`);
      }
    };

    play();

    const intervalId = setInterval(play, 1000);
    return () => {
      clearInterval(intervalId);
    };
  }, [props.story]);

  const setupApp = () => {
    if (!appRef.current && faceContainerRef.current) {
      let width = faceContainerRef.current?.clientWidth || window.innerWidth;
      let height = faceContainerRef.current?.clientHeight || window.innerHeight;
      setContainerWidth(width);
      setContainerHeight(height);

      const app = new PIXI.Application({
        width: width,
        height: height,
        backgroundAlpha: 0,
        antialias: true,
        backgroundColor: 0x000000,
      });

      if (app) {
        // Enable sorting of the children
        app.stage.sortableChildren = true;

        // Add the PIXI app to the container
        faceContainerRef.current.appendChild(app.view);

        // Store the app in the ref
        appRef.current = app; // Store the app in the ref

        console.log(`setupApp: PIXI app initialized with resolution ${app.view.width}x${app.view.height}`);
      } else {
        console.error(`setupApp: PIXI app is null`);
      }
    } else {
      console.log(`setupApp: appRef.current is not null, not initializing PIXI app.`);
    }
  };

  // Resize the PIXI app
  useEffect(() => {
    // Resize handler
    const resizeHandler = () => {
      if (faceContainerRef.current) {
        if ((faceContainerRef.current.clientWidth && faceContainerRef.current.clientHeight) || (window.innerWidth && window.innerHeight)) {
          // resize app
          if (appRef.current && appRef.current.renderer) {
            const newWidth = faceContainerRef.current?.clientWidth || window.innerWidth;
            const newHeight = faceContainerRef.current?.clientHeight || window.innerHeight;

            // Update the container dimensions
            setContainerWidth(newWidth);
            setContainerHeight(newHeight);

            // Update the text
            if (subtitleTextRef.current) {
              subtitleTextRef.current.x = newWidth / 2; // Centered on the container
              subtitleTextRef.current.y = newHeight - 24 * 1.2 * 10; // N lines up from the bottom of the container
            }

            // Update the image or video
            if (spriteRef.current) {
              // Determine the best scale to maintain the original aspect ratio
              if (spriteRef.current.texture.width > spriteRef.current.texture.height) {
                const scale = Math.min(newWidth / spriteRef.current.texture.width, newHeight / spriteRef.current.texture.height);
                spriteRef.current.scale.set(scale);
              }

              // Update the sprite's position to be centered in the container
              spriteRef.current.x = newWidth / 2;
              spriteRef.current.y = newHeight / 2;
              spriteRef.current.anchor.set(0.5);
              spriteRef.current.zIndex = 1;
            }

            // Resize the PIXI app
            appRef.current.renderer.resize(newWidth, newHeight);

            console.log(`resizeHandler: Resizing to ${newWidth}x${newHeight}`);
          } else {
            console.error(`resizeHandler: appRef.current is null`);
          }
        } else {
          console.error(`resizeHandler: faceContainerRef.current dimensions are not available. window is ${window.innerWidth}x${window.innerHeight}`);
        }
      } else {
        console.error(`resizeHandler: faceContainerRef.current is null`);
      }
    };
    if (window) {
      console.log(`resizeHandler: Adding resize handler...`);
      window.addEventListener('resize', resizeHandler);
    }

    return () => {
      console.log(`resizeHandler: Removing resize handler...`);
      try {
        if (window) {
          window.removeEventListener('resize', resizeHandler);
        }
      } catch (error) {
        console.error(`Error in removing resize handler: ${error}`);
      }
    };
  }, []);

  // setup or update the text
  const setupText = (textString: string) => {
    const textStyle = new TextStyle({
      fontSize: 48,
      fontWeight: 'bolder',
      fill: 'white',
      fontFamily: 'Trebuchet MS',
      lineHeight: 48, // 1.2 times the font size
      align: 'center',
      wordWrap: true, // Enable word wrap
      wordWrapWidth: containerWidth - 40, // Set word wrap width with some padding
      dropShadow: true,
      dropShadowAngle: Math.PI / 6,
      dropShadowBlur: 3,
      dropShadowDistance: 6,
      padding: 2,
      dropShadowColor: '#000000',
    });

    const richText = new PIXI.Text(textString, textStyle);
    richText.x = containerWidth / 2; // Centered horizontally in the container
    richText.anchor.x = 0.5; // Center-align the text horizontally
    richText.y = containerHeight - 24 * 1.2 * 10; // N lines up from the bottom of the container
    richText.zIndex = 10; // Set the zIndex of the text object

    // Remove the existing sprite from the stage if it exists
    if (appRef.current?.stage) {
      if (subtitleTextRef.current) {
        // Destroy previous texture if it exists
        appRef.current.stage.removeChild(subtitleTextRef.current);
        subtitleTextRef.current.texture.destroy(true); // Pass true to destroy the base texture as well
      }
      appRef.current.stage.addChild(richText);
    }
    setCurrentText(textString);
    subtitleTextRef.current = richText;
  };

  const setupVideoOrImage = async (imageOrVideo: string) => {
    const isVideo: boolean = /\.(mp4|webm|ogg)$/i.test(imageOrVideo);
    isVideoRef.current = isVideo;

    // Check if the video resource already exists in the loader's cache
    if (loaderRef.current && !loaderRef.current.resources[imageOrVideo]) {
      loaderRef.current.add(imageOrVideo);
    } else if (loaderRef.current) {
      console.log(`setupVideoOrImage: loaderRef.current.resources[${imageOrVideo}] already exists`);
    } else {
      console.log(`setupVideoOrImage: loaderRef.current is null`);
    }

    // Handler for the 'loadstart' even
    const loadstartHandler = () => {
      console.log('Load started');
    };

    // Handler for the 'progress' event
    let lastProgressLogTime = 0;
    const progressHandler = () => {
      const currentTime = Date.now();
      // Log progress only if more than 1 second has passed since the last log
      if (currentTime - lastProgressLogTime > 1000) {
        console.log('Progress event fired');
        lastProgressLogTime = currentTime;
      }
    };

    // Handler for the 'ended' event
    const endedHandler = () => {
      console.log('Video ended');
      if (videoElementRef.current) {
        videoElementRef.current.currentTime = 0;
      }
    };

    /// Handler for the 'canplay' event
    const canplayHandler = () => {
      console.log('Video can play');
      videoReadyRef.current = true; // Set the video as ready to play
    };

    // Handler for the 'loadeddata' event
    const loadeddataHandler = () => {
      console.log('Video data loaded');
    };

    // Handler for the 'error' event
    const errorHandler = () => {
      console.log('Video error occurred');
    };

    // Handler for the 'abort' event
    const abortHandler = () => {
      console.log('Video loading aborted');
    };

    if (isVideo && loaderRef.current && loaderRef.current.resources[imageOrVideo]) {
      // Load video into PixiJS sprite using the shared loader
      loaderRef.current.load(async (loader: PIXI.Loader, resources: Partial<Record<string, PIXI.LoaderResource>>) => {
        const videoResource = resources[imageOrVideo];

        if (videoResource) {
          // Create a video texture from the video resource
          const videoElement: HTMLVideoElement = videoResource.data as HTMLVideoElement;
          const videoTexture: PIXI.Texture = PIXI.Texture.from(videoResource.data as HTMLVideoElement);
          const videoSprite: PIXI.Sprite = new PIXI.Sprite(videoTexture as PIXI.Texture);

          let originalAspectRatio = 1;

          if (videoTexture && videoTexture.width && videoTexture.height) {
            originalAspectRatio = videoTexture.width / videoTexture.height;
          }

          // Set the width to the container width and adjust the height to maintain the original aspect ratio
          videoSprite.width = containerWidth;
          videoSprite.height = containerWidth / originalAspectRatio; // Height based on original aspect ratio

          // Move the sprite to the center of the screen
          videoSprite.x = containerWidth / 2;
          videoSprite.y = containerHeight / 2;
          videoSprite.anchor.set(0.5);

          videoSprite.zIndex = 0;

          console.log(`setupVideoOrImage: videoSprite setup resolution=${videoSprite.x}x${videoSprite.y} anchor=${videoSprite.anchor.x},${videoSprite.anchor.y} zIndex=${videoSprite.zIndex}`);

          // Set the loop property to false
          videoElement.loop = true;
          videoElement.muted = true;
          videoElement.autoplay = false;
          videoElement.crossOrigin = 'anonymous'; // Allow cross-origin videos

          videoElementRef.current = videoElement; // Store the video element in the ref

          await playVideo(); // Start playing the video
          setTimeout(() => {
            // sleep and let the video play for a bit
            stopVideo();
          }, 100);

          // Add the event listeners
          videoElement.addEventListener('loadstart', loadstartHandler);
          videoElement.addEventListener('progress', progressHandler);
          videoElement.addEventListener('ended', endedHandler);
          videoElement.addEventListener('canplay', canplayHandler);
          videoElement.addEventListener('loadeddata', loadeddataHandler);
          videoElement.addEventListener('error', errorHandler);
          videoElement.addEventListener('abort', abortHandler);

          console.log(`setupVideoOrImage: videoElement setup resolution=${videoElement.videoWidth}x${videoElement.videoHeight} anchor=${videoSprite.anchor.x},${videoSprite.anchor.y} zIndex=${videoSprite.zIndex}`)

          // Remove the existing sprite from the stage if it exists
          if (appRef.current?.stage) {
            // Destroy previous texture if it exists
            if (spriteRef.current) {
              spriteRef.current.texture.destroy(true); // Pass true to destroy the base texture as well
              appRef.current.stage.removeChild(spriteRef.current);
            }
            appRef.current.stage.addChild(videoSprite);
          }
          spriteRef.current = videoSprite;
          setCurrentUrl(imageOrVideo);

          // Debugging logs
          console.log('Autoplay after setting:', videoElement.autoplay); // Should be false
          console.log('Loop after setting:', videoElement.loop); // Should be true
          console.log('Muted after setting:', videoElement.muted);       // Should be true

          console.log(`Video sprite attached ${imageOrVideo}`); // Log the sprite
        } else {
          console.error(`setupVideoOrImage: videoResource is null`);
        }
      });
    } else if (loaderRef.current && loaderRef.current.resources[imageOrVideo]) {
      // Load video into PixiJS sprite using the shared loader
      loaderRef.current.load((loader: PIXI.Loader, resources: Partial<Record<string, PIXI.LoaderResource>>) => {
        const imageResource = resources[imageOrVideo];

        if (imageResource) {
          const imageTexture: PIXI.Texture = PIXI.Texture.from(imageResource.data as HTMLVideoElement);
          const image: PIXI.Sprite = new PIXI.Sprite(imageTexture as PIXI.Texture);

          // Center the sprite's anchor point
          image.anchor.set(0.5);

          let originalAspectRatio = 1;
          // Calculate the original aspect ratio
          if (imageTexture && imageTexture.width && imageTexture.height) {
            originalAspectRatio = imageTexture.width / imageTexture.height;
          }

          // Set the width to the container width and adjust the height to maintain the original aspect ratio
          image.width = containerWidth;
          image.height = containerWidth / originalAspectRatio; // Height based on original aspect ratio

          // Move the sprite to the center of the screen
          image.x = containerWidth / 2;
          image.y = containerHeight / 2;

          // Add the sprite to the stage
          image.zIndex = 0;

          console.log(`setupVideoOrImage: image setup resolution=${image.x}x${image.y} anchor=${image.anchor.x},${image.anchor.y} zIndex=${image.zIndex}`);

          // Remove the existing sprite from the stage if it exists
          if (appRef.current?.stage) {
            // Destroy previous texture if it exists
            if (spriteRef.current) {
              spriteRef.current.texture.destroy(true); // Pass true to destroy the base texture as well
              appRef.current.stage.removeChild(spriteRef.current);
            }
            appRef.current.stage.addChild(image);
          }
          spriteRef.current = image;

          console.log(`Image sprite attached ${imageOrVideo}`); // Log the sprite
          setCurrentUrl(imageOrVideo);
        }
      });
    } else {
      console.log(`setupVideoOrImage: loaderRef.current is null or loaderRef.current.resources[${imageOrVideo}] is null`);
    }

    // Return teardown functions to remove the listeners
    return {
      teardownLoadstart: () => videoElementRef.current ? videoElementRef.current.removeEventListener('loadstart', loadstartHandler) : null,
      teardownProgress: () => videoElementRef.current ? videoElementRef.current.removeEventListener('progress', progressHandler) : null,
      teardownEnded: () => videoElementRef.current ? videoElementRef.current.removeEventListener('ended', endedHandler) : null,
      teardownCanplay: () => videoElementRef.current ? videoElementRef.current.removeEventListener('canplay', canplayHandler) : null,
      teardownLoadeddata: () => videoElementRef.current ? videoElementRef.current.removeEventListener('loadeddata', loadeddataHandler) : null,
      teardownError: () => videoElementRef.current ? videoElementRef.current.removeEventListener('error', errorHandler) : null,
      teardownAbort: () => videoElementRef.current ? videoElementRef.current.removeEventListener('abort', abortHandler) : null,
    };
  };

  // Load App on mount
  useEffect(() => {
    if (faceContainerRef.current && !appRef.current) {
      setupApp();
      setupText(props.defaultSubtitle);
      setupVideoOrImage(props.defaultImage);
    }

    return () => {
      if (appRef.current) {
        console.log(`Destroying PIXI app`);
        appRef.current.destroy();
        appRef.current = null;
      }
    };
  }, []);

  // Load the default subtitle
  useEffect(() => {
    if (faceContainerRef.current && appRef.current && !isPlaybackInProgressRef.current) {
      // Setup the PIXI app
      try {
        // Load the default text
        setupText(props.defaultSubtitle);
      } catch (error) {
        console.error(`Error loading Subtitle defaults: ${error}`);
      }
    }
  }, [faceContainerRef.current, props.defaultSubtitle]);

  // Load the default image
  useEffect(() => {
    if (faceContainerRef.current && appRef.current && !isPlaybackInProgressRef.current) {
      // Setup the PIXI app
      try {
        // Load the default image
        setupVideoOrImage(props.defaultImage);
      } catch (error) {
        console.error(`Error loading Image/Video defaults: ${error}`);
      }
    }
  }, [faceContainerRef.current, props.defaultImage]);

  return (
    <div ref={faceContainerRef} style={{ position: 'relative', width: '100%', height: '100%' }}></div>
  );
});

AnimateStory.displayName = 'AnimateStory';

export default AnimateStory;