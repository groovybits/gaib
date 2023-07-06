import * as admin from 'firebase-admin';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error('The GOOGLE_APPLICATION_CREDENTIALS environment variable is not defined');
}

const serviceAccount = await import(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount.default),
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
});

const db = admin.firestore();
const auth = admin.auth();

async function backfillUsers() {
  // Get all users
  const users = await auth.listUsers();

  // Iterate over each user
  for (const user of users.users) {
    // Check if user already exists in Firestore
    const userDoc = await db.collection('users').doc(user.uid).get();

    // If user doesn't exist in Firestore, add them
    if (!userDoc.exists) {
      await db.collection('users').doc(user.uid).set({
        uid: user.uid,
        email: user.email,
        name: user.displayName,
        provider: user.providerData[0]?.providerId,
        photoUrl: user.photoURL,
        tokenBalance: 2000, // Set initial token balance
        isPremium: false,
        isAdmin: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`Added user ${user.uid} to Firestore`);
    }
  }
}

backfillUsers().catch(console.error);
