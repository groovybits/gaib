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
const loginAuth = process.env.NEXT_PUBLIC_LOGIN_AUTH_ENABLE ? true : false;

interface Props { }

function Auth({ }: Props): ReactElement {
  const [user, userLoading] = useAuthState(firebase.auth());
  const userIsPremium = usePremiumStatus(user);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [priceDetails, setPriceDetails] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState('');
  const [showPremium, setShowPremium] = useState(false);

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
      const fetchPriceDetails = async () => {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/getPriceDetails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          body: JSON.stringify({ priceId: stripePriceId }),
        });
        const data = await response.json();
        setPriceDetails(data);
      };

      fetchPriceDetails();
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

  const registerUser = async (email: string, password: string) => {
    try {
      const userCredential = await firebase
        .auth()
        .createUserWithEmailAndPassword(email, password);
      return userCredential.user;
    } catch (error) {
      throw error;
    }
  };

  const loginUser = async (email: string, password: string) => {
    try {
      const userCredential = await firebase
        .auth()
        .signInWithEmailAndPassword(email, password);
      return userCredential.user;
    } catch (error) {
      throw error;
    }
  };  

  const handleSignIn = async () => {
    try {
      const user = await loginUser(email, password);
      console.log("User logged in:", user);
      setMessage('Logged in successfully!');
    } catch (error : any) {
      console.error("Error signing in:", error);
      setMessage('Error signing in: ' + error.message);
    }
  };
  
  const handleRegister = async () => {
    try {
      const user = await registerUser(email, password);
      console.log("User registered:", user);
      setMessage('User registered successfully!');
    } catch (error : any) {
      console.error("Error registering user:", error);
      setMessage('Error registering user: ' + error.message);
    }
  };
  

  async function signInWithGoogle() {
    try {
      const userCredentials = await firebase
        .auth()
        .signInWithPopup(new firebase.auth.GoogleAuthProvider());

      if (userCredentials && userCredentials.user) {
        console.log("userId:", userCredentials.user.uid,
          " provider:", userCredentials.user.providerData[0]?.providerId,
          " photoUrl:", userCredentials.user.photoURL,
          " displayName:", userCredentials.user.displayName || "unknown",
          " email:", userCredentials.user.email);
        
        firebase.functions().httpsCallable('updateLastLogin')().catch(console.error);
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
              {showPremium ? (
              <><p>(${priceDetails?.unit_amount / 100}/month for {premiumTokenBalance} tokens, Free users have {freeTokenBalance} initially)</p><a href="#" onClick={() => createCheckoutSession(user.uid)} className={styles.header}>
                  Purchase Premium Subscription
                </a></>
              ) : (
                <p>Currently in Beta.</p>
              )}
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
        {loginAuth ? (
        <div className={styles.dropdowncontainer}>
          <input
            type="text"
            className={styles.emailInput} 
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            className={styles.passwordInput} 
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className={styles.signInButton} onClick={handleSignIn}>Sign In</button>
          <button className={styles.signInButton} onClick={handleRegister}>Register</button>
        </div>
        ) : (
          <div></div>
        )}
        <div className={styles.footer}>
          {message && <div className={styles.message}>{message}</div>}
          <ServiceInfo /> {/* Add the ServiceInfo component */}
        </div>
      </div>
    </div>
  );
  
}

export default Auth;
