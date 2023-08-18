import { update } from 'lodash';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

interface FaceComponentProps {
  audioPath: string;
  imagePath: string;
  modelPath: string;
}

const FaceComponent: React.FC<FaceComponentProps> = ({ audioPath, imagePath, modelPath }) => {
  // Ref to store the plane object
  const planeRef = useRef<THREE.Mesh | null>(null);
  const heightRef = useRef<number>(512); // Define height as a ref
  const widthRef = useRef<number>(512); // Define width as a ref

  useEffect(() => {
    // Initialize Three.js scene, camera, renderer
    let width = window.innerWidth;
    let height = window.innerHeight;
    //widthRef.current = width;
    //heightRef.current = height;
    //let width = widthRef.current;
    //let height = heightRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    //camera.position.z = 5; // Adjust the camera position
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(width, height);
    document.getElementById('face-container')?.appendChild(renderer.domElement);

    // Handle window resizing
    const handleResize = () => {
      let width = window.innerWidth;
      let height = window.innerHeight;
      //let width = widthRef.current;
      //let height = heightRef.current;
      console.log(`FaceComponent: Window resized to ${width} x ${height}`);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    const textureLoader = new THREE.TextureLoader();
    let plane: THREE.Mesh | null = null;

    // Function to update the plane
    const updatePlane = (newImagePath: string) => {
      if (planeRef.current) {
        // Remove the existing plane from the scene
        scene.remove(planeRef.current);

        // Dispose of existing geometry, material, and texture
        planeRef.current.geometry.dispose();
        if (Array.isArray(planeRef.current.material)) {
          planeRef.current.material.forEach((mat) => {
            if (mat instanceof THREE.MeshBasicMaterial) {
              mat.map?.dispose();
              mat.dispose();
            }
          });
        } else if (planeRef.current.material instanceof THREE.MeshBasicMaterial) {
          planeRef.current.material.map?.dispose();
          planeRef.current.material.dispose();
        }

        // Load the new texture and create a new mesh with new geometry and material
        textureLoader.load(newImagePath,
          (texture) => {
            const aspectRatio = texture.image.width / texture.image.height;
            const geometry = new THREE.PlaneGeometry(1, 1 / aspectRatio);
            const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
            planeRef.current = new THREE.Mesh(geometry, material);

            // Add the new mesh to the scene
            scene.add(planeRef.current);

            // Reset or set the camera's position and orientation to ensure correct view
            camera.position.set(0, 0, 1000); // Adjust the position as needed for your setup
            camera.lookAt(scene.position);
          },
          undefined,
          (error) => {
            console.error('An error occurred while loading the texture:', error);
          }
        );
      }
    };

    // Initial plane creation
    updatePlane(imagePath);
    
    textureLoader.load(imagePath,
      (texture) => { // onLoad callback
        let width = widthRef.current;
        let height = heightRef.current;
        console.log(`FaceComponent: Image width: ${width}, height: ${height}`);
        const aspectRatio = width / height;
        const geometry = new THREE.PlaneGeometry(height * aspectRatio, height);
        const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
        plane = new THREE.Mesh(geometry, material);
        scene.add(plane);
      },
      undefined, // onProgress callback
      (error) => { // onError callback
        console.error('An error occurred while loading the texture:', error);
      }
    );

    // Adjust camera position if needed
    camera.position.z = 1000; // Adjust this value as needed
    camera.lookAt(scene.position); // Make the camera look at the center of the scene
    //camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    // Load face model
    let mouth: THREE.Object3D | null = null;
    if (modelPath) {
      const loader = new GLTFLoader();
      loader.load(modelPath, (gltf) => {
        const model = gltf.scene;
        mouth = model.getObjectByName('Mouth') as THREE.Object3D; // Explicitly assert the type
        scene.add(model);
      }, undefined, (error) => {
        console.error('An error occurred while loading the model:', error);
      });
    }

    // Load audio and set up audio analysis
    const audioElement = new Audio(audioPath);
    const audioContext = new AudioContext();
    const source = audioContext.createMediaElementSource(audioElement);
    const analyser = audioContext.createAnalyser();
    if (audioPath && audioPath != '') {
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      audioElement.play();
    }

    const calculateMouthState = (dataArray: Uint8Array): number => {
      // Calculate the average volume level
      const sum = dataArray.reduce((acc, value) => acc + value, 0);
      const average = sum / dataArray.length;

      // Normalize the volume level to a value between 0 and 1
      const normalizedVolume = average / 255;

      // Map the volume level to a rotation angle for the mouth
      const mouthRotation = normalizedVolume * Math.PI / 4; // Up to 45 degrees

      return mouthRotation;
    };

    const analyzeAudio = () => {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(dataArray);
      const mouthState = calculateMouthState(dataArray);

      if (mouth) {
        mouth.rotation.x = mouthState;
      }
    };

    // Animate mouth
    const animate = () => {
      analyzeAudio();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    animate();

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      // Dispose of Three.js objects as needed
      if (plane) {
        scene.remove(plane); // Remove the plane from the scene
        plane.geometry.dispose();
        if (Array.isArray(plane.material)) {
          plane.material.forEach((mat) => mat.dispose());
        } else {
          plane.material.dispose();
        }
      }
    };
  }, [audioPath, imagePath, modelPath]);

  // Separate useEffect to handle imagePath changes
  useEffect(() => {
    if (planeRef.current) {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(imagePath,
        (texture) => {
          let width = texture.image.width;
          let height = texture.image.height;
          const aspectRatio = width / height;

          if (planeRef.current) {
            // Dispose of existing geometry
            const newGeometry = new THREE.PlaneGeometry(1, 1 / aspectRatio);
            planeRef.current.geometry.dispose();
            planeRef.current.geometry = newGeometry;

            // Update the plane's material map with the new texture
            if (planeRef.current.material instanceof THREE.MeshBasicMaterial) {
              planeRef.current.material.map = texture;
              planeRef.current.material.needsUpdate = true;
            } else if (Array.isArray(planeRef.current.material)) {
              planeRef.current.material.forEach((mat) => {
                if (mat instanceof THREE.MeshBasicMaterial) {
                  mat.map = texture;
                  mat.needsUpdate = true;
                }
              });
            }
          }
        },
        undefined,
        (error) => {
          console.error('An error occurred while loading the texture:', error);
        }
      );
    }
  }, [imagePath]); // Dependencies include only imagePath

  return <div id="face-container" style={{ position: 'relative', width: '100%', height: '100%' }}></div>;
};

export default FaceComponent;
