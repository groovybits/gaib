import firebase from "firebase/app";
import "firebase/auth";
import "firebase/firestore";

const authEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTH === 'true' ? true : false;

// Firebase configuration variables loaded from environment variables
const clientCredentials = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// If Firebase isn't already initialized, initialize it using the above credentials.
if (!firebase.apps.length && authEnabled) {
  firebase.initializeApp(clientCredentials);
}

export default firebase;