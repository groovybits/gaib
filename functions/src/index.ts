import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import {Storage} from "@google-cloud/storage";
import sharp from "sharp";

admin.initializeApp();
const storage = new Storage();
const db = admin.firestore();

/**
 * Firebase Cloud Function that generates thumbnails for new stories.
 *
 * @param {functions.storage.ObjectMetadata} object -
 * The metadata of the object that was created.
 * @returns {Promise<void>}
 */
exports.generateThumbnail = functions.database
  .ref("/stories/{storyId}")
  .onCreate(async (snapshot, context) => {
    try {
      const storyId = context.params.storyId;
      const storyUrl = snapshot.val().url;

      console.log(`generateThumbnail triggered by storyId: ${storyId}`);

      // Fetch the JSON file from the storage
      const parsedUrl = new URL(storyUrl);
      let bucketFilePath = parsedUrl.pathname.slice(1);

      const bucketName: string = functions.config().storage.bucket;

      // Remove the bucket name from the file path if it exists
      if (bucketFilePath.startsWith(bucketName)) {
        bucketFilePath = bucketFilePath.slice(bucketName.length);
      }

      // Remove the leading slash from the file path if it exists
      if (bucketFilePath.startsWith("/")) {
        bucketFilePath = bucketFilePath.slice(1);
      }

      const file = storage.bucket(bucketName).file(bucketFilePath);
      const [content] = await file.download();
      const story = JSON.parse(content.toString());

      if (!story || !story.imageUrls) {
        console.log("No story or imageUrls found");
        return;
      }

      // Process each image individually
      const thumbnailUrls = [];
      for (let index = 0; index < story.imageUrls.length; index++) {
        try {
          const thumbnailUrl = await createThumbnail(storyId,
            JSON.parse(story.imageUrls[index]).url, index);
          thumbnailUrls.push(thumbnailUrl);
        } catch (error) {
          console.error(
            `Failed to create thumbnail for image at index ${index}`,
            error);
        }
      }

      console.log("Generated thumbnails for story:" +
        ` ${storyId} adding thumbnailsGenerated flag.`);

      // Update the data.json in GCS to include the thumbnail URLs
      const dataJsonPath = `stories/${storyId}/data.json`;
      const dataJsonFile = storage.bucket(bucketName).file(dataJsonPath);
      const [dataJsonContent] = await dataJsonFile.download();
      const dataJson = JSON.parse(dataJsonContent.toString());
      dataJson["thumbnailUrls"] = thumbnailUrls;
      await dataJsonFile.save(JSON.stringify(dataJson));
    } catch (error) {
      console.error("Failed to generate thumbnails", error);
    }
  });

/**
 * Creates a thumbnail for an image in a story.
 *
 * @param { string } storyId - The ID of the story.
 * @param { string } imageUrl - The URL of the image.
 * @param { number } index - The index of the image in the story.
 * @return { Promise<void> }
 */
async function createThumbnail(storyId: string,
  imageUrl: string, index: number): Promise<string> {
  try {
    const parsedUrl = new URL(imageUrl);
    let bucketFilePath = parsedUrl.pathname.slice(1);

    const bucketName: string = functions.config().storage.bucket;

    // Remove the bucket name from the file path if it exists
    if (bucketFilePath.startsWith(bucketName)) {
      bucketFilePath = bucketFilePath.slice(bucketName.length);
    }

    // Remove the leading slash from the file path if it exists
    if (bucketFilePath.startsWith("/")) {
      bucketFilePath = bucketFilePath.slice(1);
    }

    const file = storage.bucket(bucketName).file(bucketFilePath);
    const [content] = await file.download();

    const resizedImageBuffer = await sharp(content)
      .resize(256)
      .jpeg({quality: 90})
      .toBuffer();

    const thumbnailPath = `thumbnails/${storyId}/${index}.jpeg`;
    const thumbnailFile = storage.bucket(bucketName).file(thumbnailPath);
    await thumbnailFile.save(resizedImageBuffer,
      {contentType: "image/jpeg"});

    // Return the public URL of the thumbnail
    return `https://storage.googleapis.com/${bucketName}/${thumbnailPath}`;
  } catch (error) {
    console.error(`Failed to create thumbnail for story: ${storyId}`,
      error);
    throw error; // Re-throw the error to be caught in the outer function
  }
}

const stripe = new Stripe(functions.config().stripe.secret, {
  apiVersion: functions.config().stripe.api_version,
});

exports.setInitialTokenBalance =
    functions.auth.user().onCreate(async (user) => {
      const initialTokenBalance =
    parseInt(functions.config().stripe.trial_token_balance || "2000");

      console.log(`Setting initial token balance for user: ${user.uid}`);

      try {
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
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.error("Failed to set initial token balance for user", err);
      }
    });

// Update lastLogin field on user sign-in
exports.updateLastLogin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be logged in to update last login."
    );
  }

  const uid = context.auth.uid;

  try {
    await db.collection("users").doc(uid).update({
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      loginCount: admin.firestore.FieldValue.increment(1),
    });
    console.log(`Updated lastLogin for user: ${uid}`);
    return {success: true};
  } catch (err) {
    console.error(`Failed to update lastLogin for user: ${uid}`, err);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to update the last login."
    );
  }
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
        parseInt(functions.config().stripe.premium_token_balance || "100000");

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
      parseInt(functions.config().stripe.premium_token_balance || "100000");

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


