import React, { ReactElement, useEffect, useState } from "react";
import firebase from "@/config/firebaseClientInit";
import Home from '@/components/Home';
import styles from '@/styles/Home.module.css';
import { createCheckoutSession } from "@/config/createCheckoutSession";
import { useAuthState } from "react-firebase-hooks/auth";
import usePremiumStatus from "@/config/usePremiumStatus";
import ServiceInfo from './ServiceInfo';
import 'firebase/functions';
import { useDocumentData } from "react-firebase-hooks/firestore";
import Modal from "react-modal";

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

interface Props { }

function Auth({ }: Props): ReactElement {
  const [user, userLoading] = useAuthState(firebase.auth());
  const userIsPremium = usePremiumStatus(user);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [priceDetails, setPriceDetails] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

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

  // Replace the confirm() function call with setShowModal(true)
  async function cancelSubscription() {
    setShowModal(true);
  }

  // Add a new function to handle the confirmation
  async function handleConfirmation() {
    const cancelPremiumSubscription = firebase.functions().httpsCallable('cancelPremiumSubscription');

    try {
      const result = await cancelPremiumSubscription();
      console.log('Subscription cancelled successfully:', result.data);
    } catch (error) {
      console.error('Error cancelling subscription:', error);
    }

    setShowModal(false);
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
      <div className={styles.mainTransparent}>
        <Home user={user} /> {/* Pass user object to Home component */}
        <div className={styles.header}>
          <p>Welcome, {user.displayName}! Token Balance: {userDataLoading ? "Loading..." : userData?.tokenBalance}</p>
        </div>
        <div className={styles.header}>
          {!userIsPremium ? (
            <div className={styles.header}>
              <p>(${priceDetails?.unit_amount / 100}/month for {premiumTokenBalance} tokens, Free users have {freeTokenBalance} initially)</p>
              <a href="#" onClick={() => createCheckoutSession(user.uid)} className={styles.header}>
                Purchase Premium Subscription
              </a>
            </div>
          ) : (
            <div className={styles.header}>
              <p>You are a Groovy Human!!! [PREMIUM]</p>
            </div>
          )}
        </div>
        <div className={styles.header}>
          {userIsPremium ? (
            <div className={styles.footer}>
              <a href="#" onClick={cancelSubscription} className={styles.cancelsubbutton}>Cancel Subscription</a>
              <Modal
                isOpen={showModal}
                onRequestClose={() => setShowModal(false)}
                contentLabel="Cancel Subscription Confirmation"
                ariaHideApp={false}
                className={styles.popupContent}
              >
                <div className={styles.footer}>
                  <p className={styles.header}>Are you sure you want to cancel your premium subscription?</p>
                </div>
                <button onClick={handleConfirmation} className={styles.stopvoicebutton}>Yes, cancel my subscription</button>
                <button onClick={() => setShowModal(false)} className={styles.generatebutton}>No, keep my subscription</button>
              </Modal>
            </div>
          ) : (
            <div></div>
          )}
        </div>
        <div className={styles.footer}>
          <div className={styles.footerContainer}>
            <a href="https://groovy.org">The Groovy Organization</a>&nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="https://www.pexels.com">Photos provided by Pexels</a>&nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="https://github.com/groovybits/gaib">github.com/groovybits/gaib</a>&nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="#" onClick={signOut}>Sign out</a>
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
    <div className={styles.cloud}>
      <div className={styles.mainlogin}>
        <title>GAIB</title>
        <div className={styles.header}>
          <div className={styles.header}>
            <h1>Groovy AI Bot (GAIB)</h1>
            <button className={styles.generatebutton} onClick={() => signInWithGoogle()}>Sign in with Google</button>
          </div>
        </div>
         <div className={styles.footer}>
          <ServiceInfo /> {/* Add the ServiceInfo component */}
        </div>
      </div>
    </div>
  );
}

export default Auth;
