import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";

admin.initializeApp();
const db = admin.firestore();

const stripe = new Stripe(functions.config().stripe.secret, {
  apiVersion: functions.config().stripe.api_version,
});

exports.setInitialTokenBalance =
    functions.auth.user().onCreate(async (user) => {
      const initialTokenBalance =
    parseInt(functions.config().stripe.trial_token_balance || "50000");

      await
      admin.firestore().collection("users").doc(user.uid).set({
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
      const premiumTokens =
        parseInt(functions.config().stripe.premium_token_balance || "5000000");

      // Allocate tokens to the user and set isPremium to true
      await userRef.update({
        tokenBalance: admin.firestore.FieldValue.increment(premiumTokens),
        isPremium: true,
      });

      console.log(`Allocated ${premiumTokens} tokens to user: ${userId}`);
    }
  });

// Update the Stripe customer object with the premium role when a user upgrades
exports.handleStripeWebhook =
  functions.https.onRequest(async (request, response) => {
    const signature = request.headers["stripe-signature"] as string;
    let event;

    try {
      event = stripe.webhooks.constructEvent(request.rawBody,
        signature, functions.config().stripe.webhook_secret);
    } catch (err) {
      if (err instanceof Error) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        response.status(400).send(`Webhook Error: ${err.message}`);
      } else {
        console.error(`Webhook signature verification failed: ${err}`);
        response.status(400).send(`Webhook Error: ${err}`);
      }
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const subscriptionId = session.subscription as string;

      if (userId && subscriptionId) {
        const userRef = db.collection("users").doc(userId);
        // convert environment variable to a number
        const premiumTokens =
      parseInt(functions.config().stripe.premium_token_balance || "5000000");

        // Allocate tokens to the user and set isPremium to true
        await userRef.update({
          tokenBalance:
            admin.firestore.FieldValue.increment(premiumTokens),
          isPremium: true,
        });

        console.log(`Allocated ${premiumTokens} tokens to user: ${userId}`);
      } else {
        console.error("UserId / subscriptionId missing in session metadata");
      }
    } else if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;

      if (subscription.cancel_at_period_end) {
        const customerId = subscription.customer as string;
        const customer =
          await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const userId = customer.metadata.userId;

        await db.collection("users").doc(userId).update({isPremium: false});
        console.log(`Updated isPremium status to false for user: ${userId}`);
      }
    }

    response.status(200).send("Webhook handled successfully");
  });

exports.cancelPremiumSubscription =
  functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be logged in to cancel a subscription."
      );
    }

    const uid = context.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();

    if (!userData || !userData.stripeId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "User does not have an active subscription, not a user."
      );
    }

    const customer =
    await
    stripe.customers.retrieve(userData.stripeId) as Stripe.Customer;

    const subscriptions =
      await stripe.subscriptions.list({customer: userData.stripeId});
    console.log("customer ID:", customer.id);
    console.log("customer subscriptions:",
      JSON.stringify(subscriptions));

    if (!customer || !subscriptions ||
      subscriptions.data.length === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "User does not have an active subscription, not a customer 002."
      );
    }

    const subscription = subscriptions.data[0];

    if (!subscription) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "User does not have an active subscription."
      );
    }

    console.log("Updating subscription:", subscription.id); // Add this line

    try {
    // Update the cancel_at_period_end property
      const updatedSubscription =
    await stripe.subscriptions.update(subscription.id,
      {cancel_at_period_end: true});

      console.log("Updated subscription:",
        JSON.stringify(updatedSubscription)); // Add this line
    } catch (err) {
      console.error("Failed to update subscription:", err);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to update the subscription."
      );
    }

    const updatedSubscription =
      await stripe.subscriptions.retrieve(subscription.id);

    await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("subscriptions")
      .doc(subscription.id)
      .set({
        cancel_at: updatedSubscription.cancel_at,
        cancel_at_period_end: updatedSubscription.cancel_at_period_end,
        canceled_at: updatedSubscription.canceled_at,
      }, {merge: true});

    const user = await admin.auth().getUser(uid);
    if (user.customClaims && user.customClaims.stripeRole) {
      const updatedClaims = {...user.customClaims};
      delete updatedClaims.stripeRole;
      await admin.auth().setCustomUserClaims(uid, updatedClaims);
    }

    await db.collection("users").doc(uid).update({isPremium: false});

    return {success: true};
  });


