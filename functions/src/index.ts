import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

exports.setInitialTokenBalance =
    functions.auth.user().onCreate(async (user) => {
      const initialTokenBalance =
      parseInt(process.env.INITIAL_TOKEN_BALANCE || "0");

      await admin.firestore().collection("users").doc(user.uid).set({
        uid: user.uid,
        email: user.email,
        name: user.displayName,
        provider: user.providerData[0]?.providerId,
        photoUrl: user.photoURL,
        tokenBalance: initialTokenBalance,
        isPremium: false,
        isAdmin: false,
      });
    });

// Listen for successful Stripe payment events
exports.allocateTokensOnSuccessfulPayment = functions.firestore
  .document("users/{userId}/subscriptions/{subscriptionId}")
  .onCreate(async (snapshot, context) => {
    const userId = context.params.userId;
    const subscriptionData = snapshot.data();

    if (subscriptionData && subscriptionData.status === "active") {
      const userRef = db.collection("users").doc(userId);
      // convert environment variable to a number
      const premiumTokens = parseInt(process.env.PREMIUM_TOKEN_BALANCE || "0");

      // Allocate tokens to the user
      await userRef.update({
        tokenBalance: admin.firestore.FieldValue.increment(premiumTokens),
      });

      console.log(`Allocated ${premiumTokens} tokens to user: ${userId}`);
    }
  });

