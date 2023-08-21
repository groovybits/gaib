import React, { useEffect, useRef } from 'react';
import { Application, Sprite, TextStyle, Text } from 'pixi.js';
import * as PIXI from 'pixi.js';
import * as faceapi from 'face-api.js';

interface FaceComponentProps {
  audioPath: string;
  imagePath: string;
  subtitle: string;
  maskPath: string; // Path to the mask or image to overlay on the mouth
}

const FaceComponent2D: React.FC<FaceComponentProps> = ({ audioPath, imagePath, subtitle, maskPath }) => {
  const faceContainerRef = useRef<HTMLDivElement | null>(null);
  const maskSpritesRef = useRef<Sprite[]>([]); // Keep track of mask sprites
  const appRef = useRef<Application | null>(null); // Ref to store the PixiJS application

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

    // Load image and mask into PixiJS sprite using the shared loader
    loader.load((loader: PIXI.Loader, resources: Partial<Record<string, PIXI.LoaderResource>>) => {
      const imageResource = resources[imagePath];
      const maskResource = resources[maskPath];

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
        const text = new Text(subtitle, textStyle);
        text.x = containerWidth / 2; // Centered on the container
        text.y = sprite.y + sprite.height - 24 * 1.2 * 6; // 2 lines up from the bottom of the image
        text.anchor.x = 0.5; // Center-align the text
        app.stage.addChild(text);

        // Listen for frame updates
        app.ticker.add(async () => {
          const extract = app.renderer.plugins.extract;
          const faceCanvas = extract.canvas(app.stage);
          const faceContext = faceCanvas.getContext('2d', { willReadFrequently: true });
          const faceImageData = faceContext?.getImageData(0, 0, faceCanvas.width, faceCanvas.height);
          const detections = await faceapi.detectAllFaces(faceCanvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();

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

            // Create mask sprite
            const maskSprite = new Sprite(maskResource.texture);
            maskSprite.x = mouthPosition.x;
            maskSprite.y = mouthPosition.y;
            // Adjust anchor, scale, and rotation as needed
            app.stage.addChild(maskSprite);

            // Add to mask sprites ref
            maskSpritesRef.current.push(maskSprite);
          });
        });
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
      appRef.current?.destroy(true);
    };
  }, [audioPath, imagePath, subtitle, maskPath]);

  useEffect(() => {
    // Resize handler
    const resizeHandler = () => {
      const newWidth = faceContainerRef.current?.clientWidth || window.innerWidth;
      const newHeight = faceContainerRef.current?.clientHeight || window.innerHeight;
      appRef.current?.renderer.resize(newWidth, newHeight);
    };

    window.addEventListener('resize', resizeHandler);
    return () => window.removeEventListener('resize', resizeHandler);
  }, []);

  return <div ref={faceContainerRef} style={{ position: 'relative', width: '100%', height: '100%' }}></div>;
};

export default FaceComponent2D;
