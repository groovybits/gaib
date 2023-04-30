import React, { ReactElement } from "react";
import firebase from "@/config/firebaseClientInit";
import Home from '@/components/home';
import styles from '@/styles/Home.module.css';
import { createCheckoutSession } from "@/config/createCheckoutSession";
import { useAuthState } from "react-firebase-hooks/auth";
import usePremiumStatus from "@/config/usePremiumStatus";
import ServiceInfo from './ServiceInfo';
import 'firebase/functions';

// Use this function in your frontend components when you want to send a log message
async function consoleLog(level: string, ...args: any[]) {
  try {
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');

    const response = await fetch('/api/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ level: level, message }),
    });

    if (!response.ok) {
      throw new Error('Failed to send log message');
    }
  } catch (error) {
    console.error(error);
  }
}

interface Props {}

function Auth({}: Props): ReactElement {
  const [user, userLoading] = useAuthState(firebase.auth());
  const userIsPremium = usePremiumStatus(user);

  async function cancelSubscription() {
    const cancelPremiumSubscription = firebase.functions().httpsCallable('cancelPremiumSubscription');
    
    try {
      const result = await cancelPremiumSubscription();
      console.log('Subscription cancelled successfully:', result.data);
    } catch (error) {
      console.error('Error cancelling subscription:', error);
    }
  }  
  
  async function signInWithGoogle() {
    try {
      const userCredentials = await firebase
        .auth()
        .signInWithPopup(new firebase.auth.GoogleAuthProvider());

      if (userCredentials && userCredentials.user) {
        consoleLog("info",
          "user:", userCredentials.user,
          " provider:", userCredentials.user.providerData[0]?.providerId,
          " photoUrl:", userCredentials.user.photoURL,
          " displayName:", userCredentials.user.displayName || "unknown",
          " email:", userCredentials.user.email);
      }
    } catch (error) {
      console.log(error);
    }
  }  

  const signOut = async () => {
    await firebase.auth().signOut();
  };
  
  if (!userLoading && user) { 
    consoleLog("info",
      "user:", user,
      " provider:", user.providerData[0]?.providerId,
      " photoUrl:", user.photoURL,
      " displayName:", user.displayName || "unknown",
      " email:", user.email);
    return (
      <div className={styles.container}>
        <div className={styles.main}>
          <Home user={user} /> {/* Pass user object to Home component */}
        </div>
        <div className={styles.header}>
          <p>Welcome, {user.displayName}!</p>
        </div>
        <div className={styles.header}>
        {!userIsPremium ? (
            <div className={styles.header}>
              <button onClick={() => createCheckoutSession(user.uid)} className={styles.voicebutton}>
                Purchase Premium Subscription
              </button>
              <p>($30/month for 5000000 tokens)</p>
            </div>              
          ) : (
            <div className={styles.header}>
              <p>You are a Groovy Human!!! [PREMIUM]</p>
              <button onClick={cancelSubscription} className={styles.stopvoicebutton}>
                Cancel Premium Subscription
              </button>
            </div>
          )}        
          <button onClick={signOut} className={styles.voicebutton}>Sign out</button>
        </div>
      </div>
    );
  }

  if (!user && userLoading) {
    return (
      <div className={styles.mainlogin}>
        <div className={styles.header}>
          <p>GAIB is Manifesting reality for you...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mainlogin}>
      <title>GAIB</title>
      <div className={styles.header}>
        <h1>GAIB The Groovy AI Bot!!!</h1>
      </div>
      <div className={styles.cloud}>
        <div className={styles.imageContainer}>
          <div className={styles.generatedImage}>
            <img src="gaib.png" alt="GAIB" style={{
                      width: 'auto',
                      height: '480px',
                      objectFit: 'scale-down',
                    }} />
          </div>
        </div>
      </div>
      <div className={styles.buttonContainer}>
        <button onClick={() => signInWithGoogle()} className={styles.voicebutton}>Sign in with Google</button>
      </div>
      <div className={styles.footer}>
        <ServiceInfo /> {/* Add the ServiceInfo component */}
      </div>
    </div>
  );
}

export default Auth;
