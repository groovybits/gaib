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
import Layout from '@/components/Layout';

const premiumTokenBalance = process.env.NEXT_PUBLIC_PREMIUM_TOKEN_BALANCE;
const freeTokenBalance = process.env.NEXT_PUBLIC_FREE_TOKEN_START;
const stripePriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
const loginAuth = process.env.NEXT_PUBLIC_LOGIN_AUTH_ENABLE ?
  (process.env.NEXT_PUBLIC_LOGIN_AUTH_ENABLE == 'true') ?
    true : false : false;
const debug = process.env.DEBUG ? (process.env.DEBUG == 'true') ? true : false : false;

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
      if (debug) {
        console.log('Subscription cancelled successfully:', result.data);
      }
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
      if (debug) {
        console.log("User logged in:", user);
      }
      setMessage('Logged in successfully!');
      if (user) {
        firebase.functions().httpsCallable('updateLastLogin')().catch(console.error);
      }
    } catch (error: any) {
      console.error("Error signing in:", error);
      setMessage('Error signing in: ' + error.message);
    }
  };

  const handleRegister = async () => {
    try {
      const user = await registerUser(email, password);
      if (debug) {
        console.log("User registered:", user);
      }
      setMessage('User registered successfully!');
    } catch (error: any) {
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
        const user = userCredentials.user;

        if (debug) {
          console.log("userId:", userCredentials.user.uid,
            " provider:", userCredentials.user.providerData[0]?.providerId,
            " photoUrl:", userCredentials.user.photoURL,
            " displayName:", userCredentials.user.displayName || "unknown",
            " email:", userCredentials.user.email);
        }

        if (user) {
          firebase.functions().httpsCallable('updateLastLogin')().catch(console.error);
          if (debug) {
            console.log("Google User logged in:", user);
          }
        } else {
          console.log(`Google User not set: ${userCredentials.user}`);
        }
      } else {
        console.log("Google User not logged in:", user);
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
      <>
        <Home user={user} /> {/* Pass user object to Home component */}
        <div className={`${styles.center}`}>
          <>Token Balance: {userDataLoading ? "Loading..." : userData?.tokenBalance}</>&nbsp;&nbsp;&nbsp;&nbsp;
          {!userIsPremium ? (
            <>
              {showPremium ? (
                <>
                  (${priceDetails?.unit_amount / 100}/month for {premiumTokenBalance} tokens, Free users have {freeTokenBalance} initially)
                  &nbsp;&nbsp;<a href="#" onClick={() => createCheckoutSession(user.uid)} className={`${styles.footer} ${styles.center}`}>
                  Purchase Premium Subscription
                  </a>
                </>
              ) : (
                <>
                  [Currently in Beta.]
                </>
              )}
            </>
          ) : (
            <>
              [PREMIUM]
            </>
          )}
          {userIsPremium ? (
            <div className={`${styles.footer} ${styles.center}`}>
              <a href="#" onClick={cancelSubscription} className={styles.cancelsubbutton}>Cancel Subscription</a>
              <Modal
                isOpen={showModal}
                onRequestClose={() => setShowModal(false)}
                contentLabel="Cancel Subscription Confirmation"
                ariaHideApp={false}
                className={styles.popupContent}
              >
                <div className={`${styles.footer} ${styles.center}`}>
                  <p className={`${styles.header} ${styles.center}`}>Are you sure you want to cancel your premium subscription?</p>
                </div>
                <button onClick={handleConfirmation} className={styles.stopvoicebutton}>Yes, cancel my subscription</button>
                <button onClick={() => setShowModal(false)} className={styles.generatebutton}>No, keep my subscription</button>
              </Modal>
            </div>
          ) : (
            <div></div>
          )}
          <a className={styles.footer} href="https://groovy.org">The Groovy Organization</a>
          {(process.env.NEXT_PUBLIC_IMAGE_SERVICE == 'pexels') ?
            <span>
              &nbsp;&nbsp;|&nbsp;&nbsp;<a className={styles.footer} href="https://www.pexels.com">Photos provided by Pexels</a>
            </span> : <span></span>
          }
          &nbsp;&nbsp;|&nbsp;&nbsp;<a className={styles.footer} href="https://github.com/groovybits/gaib">github.com/groovybits/gaib</a>&nbsp;&nbsp;|&nbsp;&nbsp;
          <a className={styles.footer} href="#" onClick={signOut}>Sign out</a>
        </div>
      </>
    );
  }

  if (!user && userLoading) {
    return (
      <div className={styles.mainlogin}>
        <div className={`${styles.header} ${styles.center}`}>
          <p>GAIB is Manifesting reality for you...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`${styles.header} ${styles.center}`}>
        <title>GAIB The Groovy AI Bot</title>
      </div>
      <Layout>
        <div className="mx-auto flex flex-col gap-4 bg-#FFCC33">
          <main className={styles.main}>
            <div className={styles.cloud}>
              <div className={styles.cloudform}>
                <div className={`${styles.header} ${styles.center}`}>
                  <h1>Groovy AI Bot (GAIB)</h1>
                </div>
                <div className={`${styles.header} ${styles.center}`}>
                  <button className={styles.generatebutton} onClick={() => signInWithGoogle()}>Sign in with Google</button>
                </div>
                {loginAuth ? (
                  <div className={styles.cloudform}>
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
                  <></>
                )}
                <div className={styles.cloudform}>
                  {message && <div className={styles.message}>{message}</div>}
                  <ServiceInfo /> {/* Add the ServiceInfo component */}
                </div>
              </div>
            </div>
          </main>
        </div>
      </Layout>
    </>
  );

}

export default Auth;
