import firebase from "@/config/firebaseClientInit";
import initializeStripe from "./initializeStripe";

export async function createCheckoutSession(uid: string) {
  const firestore = firebase.firestore();

  // Create a new checkout session in the subollection inside this users document
  const checkoutSessionRef = await firestore
    .collection("users")
    .doc(uid)
    .collection("checkout_sessions")
    .add({
      price: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
      success_url: window.location.origin,
      cancel_url: window.location.origin,
    });

  //console.log("checkoutSessionRef:", checkoutSessionRef);

  // Wait for the CheckoutSession to get attached by the extension
  checkoutSessionRef.onSnapshot(async (snap) => {
    //console.log("snap.data():", snap.data());
    const data = snap.data();
  
    if (data && data.sessionId) {
      // We have a session, let's redirect to Checkout
      // Init Stripe
      const stripe = await initializeStripe();
      stripe?.redirectToCheckout({ sessionId: data.sessionId });
    }
  });  
}
