import React, { useEffect, useRef } from 'react';
import { Application, Sprite, TextStyle, Text } from 'pixi.js';
import * as PIXI from 'pixi.js';
import * as faceapi from 'face-api.js';
import { throttle } from 'lodash';

interface FaceComponentProps {
  audioPath: string;
  imagePath: string;
  subtitle: string; // Array of subtitles with timing
  maskPath: string; // Path to the mask or image to overlay on the mouth
}

const FaceComponent2D: React.FC<FaceComponentProps> = ({ audioPath, imagePath, subtitle, maskPath }) => {
  const faceContainerRef = useRef<HTMLDivElement | null>(null);
  const maskSpritesRef = useRef<Sprite[]>([]); // Keep track of mask sprites
  const appRef = useRef<Application | null>(null); // Ref to store the PixiJS application
  const audioElementRef = useRef<HTMLAudioElement | null>(null); // Ref to store the audio element
  const subtitleTextRef = useRef<Text | null>(null); // Ref to store the PixiJS Text object for subtitles
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = (audioUrl: string) => {
    // Stop any existing audio playback
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // Create a new Audio object and play it
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.play();

    // Handle the 'ended' event
    audio.addEventListener('ended', () => {
      // Perform any actions needed when the audio ends, such as stopping speaking animation
    }, false);
  };

  const desiredWidth = 600;
  const desiredHeight = 600;

  const start = () => {
    // Initialize PixiJS application
    const containerWidth = faceContainerRef.current?.clientWidth || window.innerWidth;
    const containerHeight = faceContainerRef.current?.clientHeight || window.innerHeight;

    const app = new Application({
      width: containerWidth,
      height: containerHeight,
    });

    appRef.current = app; // Store the app instance in the ref

    if (faceContainerRef.current) {
      faceContainerRef.current.appendChild(app.view as unknown as HTMLElement);
    }

    // Load image and mask into PixiJS sprite using the shared loader
    const loader: PIXI.Loader = PIXI.Loader.shared;

    // Check if the image resource already exists in the loader's cache
    if (!loader.resources[imagePath]) {
      loader.add(imagePath);
    }

    // Check if the mask resource already exists in the loader's cache
    if (!loader.resources[maskPath]) {
      loader.add(maskPath);
    }

    loader.onError.add((error) => console.error('Error loading resources:', error));

    // Load image and mask into PixiJS sprite using the shared loader
    loader.load((loader: PIXI.Loader, resources: Partial<Record<string, PIXI.LoaderResource>>) => {
      const imageResource = resources[imagePath];
      const maskResource = resources[maskPath];

      console.log(`Resources loaded: ${imageResource} ${maskResource}`);

      if (imageResource && maskResource) {
        const sprite = new Sprite(imageResource.texture);
        const scalingFactor = Math.min(containerWidth / desiredWidth, containerHeight / desiredHeight);
        sprite.width = desiredWidth * scalingFactor;
        sprite.height = desiredHeight * scalingFactor;
        sprite.x = (containerWidth - sprite.width) / 2;
        sprite.y = (containerHeight - sprite.height) / 2;
        app.stage.addChild(sprite);

        // Create PixiJS text for subtitles
        const textStyle = new TextStyle({
          fontSize: 48,
          fontWeight: 'bolder',
          fill: 'white',
          fontFamily: 'Trebuchet MS',
          lineHeight: 48, // 1.2 times the font size
          align: 'center',
          dropShadow: true,
          dropShadowAngle: Math.PI / 6,
          dropShadowBlur: 3,
          dropShadowDistance: 6,
          padding: 2,
          dropShadowColor: '#000000',
        });
        const text = new Text(subtitle, textStyle); // Initialize with empty text
        text.x = containerWidth / 2; // Centered on the container
        text.y = sprite.y + sprite.height - 24 * 1.2 * 10; // N lines up from the bottom of the image
        text.anchor.x = 0.5; // Center-align the text
        app.stage.addChild(text);
        subtitleTextRef.current = text; // Store the text object in the ref

        // Create an AudioContext
        const audioContext = new AudioContext();

        // Create an AnalyserNode
        const analyser = audioContext.createAnalyser();

        // Check if audioRef.current is not null
        if (audioRef.current) {
          // Connect the audio element to the analyser
          const audioSource = audioContext.createMediaElementSource(audioRef.current);
          audioSource.connect(analyser);

          // Connect the analyser to the destination (speakers)
          analyser.connect(audioContext.destination);
        } else {
          console.error("Audio element is not available");
          return; // Exit the function if audioRef.current is null
        }

        // Set up an array to hold the frequency data
        const frequencyData = new Uint8Array(analyser.frequencyBinCount);

        // Function to get the current volume level
        const getVolume = () => {
          analyser.getByteFrequencyData(frequencyData);
          const averageVolume = frequencyData.reduce((sum, value) => sum + value, 0) / frequencyData.length;
          return averageVolume;
        };

        const throttledDetection = throttle(async () => {
          const extract = app.renderer.plugins.extract;
          const faceCanvas = extract.canvas(app.stage);
          const faceContext = faceCanvas.getContext('2d', { willReadFrequently: true });
          const faceImageData = faceContext?.getImageData(0, 0, faceCanvas.width, faceCanvas.height);
          const detections = await faceapi.detectAllFaces(faceCanvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
          console.log(`Face detections: ${detections}`);

          // Remove existing mask sprites
          maskSpritesRef.current.forEach((maskSprite) => app.stage.removeChild(maskSprite));
          maskSpritesRef.current = [];

          // Overlay masks based on detections
          detections.forEach((detection) => {
            const mouth = detection.landmarks.getMouth();
            const mouthPosition = {
              x: (mouth[0].x + mouth[6].x) / 2,
              y: (mouth[2].y + mouth[10].y) / 2,
            };

            // Adjust the mouth position based on the volume
            const volume = getVolume();
            const volumeScale = volume / 255; // Normalize the volume to [0, 1]
            const mouthOffset = 10 * volumeScale; // Adjust this value as needed

            console.log(`Detected mouth position: x=${mouthPosition.x}, y=${mouthPosition.y}`);

            // Draw a debug marker at the detected mouth position
            const debugMarker = new PIXI.Graphics();
            debugMarker.beginFill(0xFF0000); // Red color
            debugMarker.drawCircle(mouthPosition.x, mouthPosition.y, 5); // Draw a small circle
            debugMarker.endFill();
            app.stage.addChild(debugMarker);

            // Create mask sprite
            const maskSprite = new Sprite(maskResource.texture);

            // Scale the mask
            const mouthWidth = Math.abs(mouth[0].x - mouth[6].x);
            const mouthHeight = Math.abs(mouth[2].y - mouth[10].y);
            const maskScale = Math.max(mouthWidth / maskSprite.width, mouthHeight / maskSprite.height);
            maskSprite.scale.set(maskScale);

            // Position the mask sprite
            maskSprite.x = mouthPosition.x - (maskSprite.width * maskScale) / 2 - mouthOffset; // Adjusted x position
            maskSprite.y = mouthPosition.y - (maskSprite.height * maskScale) / 2;

            // Optional: Apply additional offsets if needed (adjust these values as required)
            maskSprite.x += 10; // Offset value for the x-axis
            maskSprite.y += 5; // Offset value for the y-axis

            app.stage.sortableChildren = true; // Enable sorting based on zIndex
            sprite.zIndex = 0; // Set the zIndex of the sprite
            maskSprite.zIndex = 1; // Set the zIndex of the maskSprite
            text.zIndex = 2; //  Set the subtitle Text object
            debugMarker.zIndex = 999; // Set a high zIndex for the debug marker

            console.log(`Mask position: x=${maskSprite.x}, y=${maskSprite.y}, width=${maskSprite.width}, height=${maskSprite.height}`);

            // Add elements to the stage
            app.stage.addChild(sprite);
            app.stage.addChild(maskSprite);
            app.stage.addChild(text);

            // Enable sorting based on zIndex
            app.stage.sortableChildren = true;

            // Add to mask sprites ref
            maskSpritesRef.current.push(maskSprite);
          });
        }, 10);

        app.ticker.add(throttledDetection);
      }
    });
  };

  useEffect(() => {
    // Load face-api.js models
    Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'),
      faceapi.nets.faceLandmark68Net.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'),
    ]).then(start);

    // Cleanup function
    return () => {
      // Check if appRef.current exists before calling destroy
      if (appRef.current) {
        console.log(`Destroying PixiJS app`);
        appRef.current.destroy(true);
      }
    };
  }, [imagePath, maskPath]);

  useEffect(() => {
    // Resize handler
    console.log(`Resizing to ${faceContainerRef.current?.clientWidth}x${faceContainerRef.current?.clientHeight}`);
    const resizeHandler = () => {
      console.log(`resizeHandler: Resizing`);
      if (faceContainerRef.current && appRef.current && appRef.current.renderer && faceContainerRef.current.clientWidth && faceContainerRef.current.clientHeight) {
        const newWidth = faceContainerRef.current?.clientWidth || window.innerWidth;
        const newHeight = faceContainerRef.current?.clientHeight || window.innerHeight;
        console.log(`resizeHandler: Resizing to ${newWidth}x${newHeight}`);
        appRef.current?.renderer.resize(newWidth, newHeight);
      } else {
        console.log(`resizeHandler: faceContainerRef.current is null`);
      }
    };

    window.addEventListener('resize', resizeHandler);
    return () => window.removeEventListener('resize', resizeHandler);
  }, []);

  useEffect(() => {
    // Watch for changes to the subtitle prop and update the text object
    console.log(`Updating subtitle to ${subtitle}`);
    if (subtitleTextRef.current) {
      subtitleTextRef.current.text = subtitle;
    }
  }, [subtitle]); // Add subtitle as a dependency to the effect

  useEffect(() => {
    // Play the audio when the component mounts or when the audioPath prop changes
    console.log(`Playing audio: ${audioPath}`);
    playAudio(audioPath);
  }, [audioPath]);

  return (
    <div ref={faceContainerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
    </div>
  );
};

export default FaceComponent2D;
