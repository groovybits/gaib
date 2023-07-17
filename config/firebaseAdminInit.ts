// config/firebaseAdminInit.ts
import * as admin from 'firebase-admin';

const authEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTH === 'true' ? true : false;
let firestoreAdmin: FirebaseFirestore.Firestore;

// only initialize firebase if auth is enabled
if (!authEnabled) {
  console.log('authCheck: Auth is not enabled, skipping firebase initialization');
} else {

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    });
  }

  firestoreAdmin = admin.firestore();

}
export { admin, firestoreAdmin };
