import React, { ReactElement, useEffect, useState } from "react";
import firebase from "@/config/firebaseClientInit";
import Home from '@/components/home';
import styles from '@/styles/Home.module.css';
import { createCheckoutSession } from "@/config/createCheckoutSession";
import { useAuthState } from "react-firebase-hooks/auth";
import usePremiumStatus from "@/config/usePremiumStatus";
import ServiceInfo from './ServiceInfo';
import 'firebase/functions';
import { useDocumentData } from "react-firebase-hooks/firestore";

const premiumTokenBalance = process.env.NEXT_PUBLIC_PREMIUM_TOKEN_BALANCE;
const freeTokenBalance = process.env.NEXT_PUBLIC_FREE_TOKEN_START;
const stripePriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;

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
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [priceDetails, setPriceDetails] = useState<any>(null);

  // Add this line after the previous two lines
  const userDocRef = user ? firebase.firestore().doc(`users/${user.uid}`) : null;
  // Add this line after creating the userDocRef
  const [userData, userDataLoading] = useDocumentData(userDocRef);


  useEffect(() => {
    if (user) {
      // Fetch the user's token balance from Firestore
      const userRef = firebase.firestore().collection("users").doc(user.uid);
      userRef.get().then((doc) => {
        if (doc.exists) {
          setTokenBalance(doc.data()?.tokenBalance);
        }
      });

      // Fetch the price details from Stripe
      fetch("/api/getPriceDetails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ priceId: stripePriceId }),
      })
        .then((res) => res.json())
        .then((data) => {
          setPriceDetails(data);
        });
    }
  }, [user]);

  async function cancelSubscription() {
    // Add a confirmation dialog
    const confirmation = confirm("Are you sure you want to cancel your premium subscription?");
    
    // Proceed with the cancelation only if the user confirms
    if (confirmation) {
      const cancelPremiumSubscription = firebase.functions().httpsCallable('cancelPremiumSubscription');
      
      try {
        const result = await cancelPremiumSubscription();
        console.log('Subscription cancelled successfully:', result.data);
      } catch (error) {
        console.error('Error cancelling subscription:', error);
      }
    }
  }  
  
  async function signInWithGoogle() {
    try {
      const userCredentials = await firebase
        .auth()
        .signInWithPopup(new firebase.auth.GoogleAuthProvider());

      if (userCredentials && userCredentials.user) {
        consoleLog("info",
          "userId:", userCredentials.user.uid,
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
    return (
      <div className={styles.container}>
        <div className={styles.main}>
          <Home user={user} /> {/* Pass user object to Home component */}
        </div>
        <div className={styles.header}>
          <p>Welcome, {user.displayName}! Token Balance: {userDataLoading ? "Loading..." : userData?.tokenBalance}</p>
        </div>
        <div className={styles.header}>
          {!userIsPremium ? (
            <div className={styles.header}>
              <p>(${priceDetails?.unit_amount / 100}/month for {premiumTokenBalance} tokens, Free users have {freeTokenBalance} initially)</p>
              <button onClick={() => createCheckoutSession(user.uid)} className={styles.generatebutton}>
                Purchase Premium Subscription
              </button>
            </div>
          ) : (
            <div className={styles.header}>
              <p>You are a Groovy Human!!! [PREMIUM]</p>
              <button onClick={cancelSubscription} className={styles.stopvoicebutton}>
                Cancel Premium Subscription
              </button>
            </div>
          )}
          <button onClick={signOut} className={styles.stopvoicebutton}>Sign out</button>
        </div>
        <div className={styles.footer}>
          <div className={styles.footerContainer}>
            <a href="https://groovy.org">The Groovy Organization</a>&nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="https://www.pexels.com">Photos provided by Pexels</a>
          </div>
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
