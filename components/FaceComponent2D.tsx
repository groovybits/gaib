import React, { useEffect, useRef } from 'react';
import { Application, Sprite, TextStyle, Text, Loader } from 'pixi.js';
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

  useEffect(() => {
    // Load face-api.js models
    Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'),
      faceapi.nets.faceLandmark68Net.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'),
    ]).then(start);
  }, [audioPath, imagePath, subtitle, maskPath]);

  const start = () => {
    // Initialize PixiJS application
    const app = new Application({
      width: window.innerWidth,
      height: window.innerHeight,
    });

    if (faceContainerRef.current) {
      faceContainerRef.current.appendChild(app.view as unknown as HTMLElement);
    }

    // Use the shared loader
    const loader = Loader.shared;

    // Load image and mask into PixiJS sprite using the shared loader
    loader.add(imagePath).add(maskPath).load((loader: PIXI.Loader, resources: Partial<Record<string, PIXI.LoaderResource>>) => {
      const imageResource = resources[imagePath];
      const maskResource = resources[maskPath];

      const desiredWidth = 600; // Desired width of the image
      const desiredHeight = 600; // Desired height of the image

      if (imageResource && maskResource) {
        const sprite = new Sprite(imageResource.texture);
        sprite.width = desiredWidth;
        sprite.height = desiredHeight;
        sprite.x = (app.renderer.width - desiredWidth) / 2;
        sprite.y = (app.renderer.height - desiredHeight) / 2;
        app.stage.addChild(sprite);

        // Create PixiJS text for subtitles
        const textStyle = new TextStyle({
          fontSize: 24,
          fill: 'white',
        });
        const text = new Text(subtitle, textStyle);
        text.x = 10; // Adjust the position as needed
        text.y = 10; // Adjust the position as needed
        app.stage.addChild(text);

        // Listen for frame updates
        app.ticker.add(async () => {
          const faceCanvas = app.renderer.extract.canvas(app.stage);
          const faceContext = faceCanvas.getContext('2d', { willReadFrequently: true });
          const faceImageData = faceContext?.getImageData(0, 0, faceCanvas.width, faceCanvas.height);
          const detections = await faceapi.detectAllFaces(faceImageData as any, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();

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

    // Cleanup function
    return () => {
      app.destroy(true);
    };
  };

  return <div ref={faceContainerRef} style={{ position: 'relative', width: '100%', height: '100%' }}></div>;
};

export default FaceComponent2D;