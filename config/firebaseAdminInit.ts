import * as admin from 'firebase-admin';

const authEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTH === 'true' ? true : false;
let firestoreAdmin: FirebaseFirestore.Firestore | undefined;

// only initialize firebase if auth is enabled
if (authEnabled) {
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
} else {
  console.log('authCheck: Auth is not enabled, skipping firebase initialization');
}

async function getUserDetails(userId: string) {
  try {
    if (firestoreAdmin && authEnabled) {
      const userDoc = await firestoreAdmin.collection("users").doc(userId).get();
      const userData = userDoc.data();
      return {
        displayName: userData ? userData.displayName : '',
        email: userData ? userData.email : '',
      };
    } else {
      return {
        displayName: 'anonymous',
        email: 'anonymous@nodomain',
      }
    }
  } catch (error: any) {
    if (error.code === 'app/no-app') {
      // Firebase Admin SDK is not initialized. Anonymous mode
      return {
        displayName: 'anonymous',
        email: 'anonymous@nodomain',
      };
    } else {
      // Some other error occurred
      throw error;
    }
  }
}

async function updateTokenBalance(userId: string, newTokenBalance: number): Promise<number> {
  if (authEnabled && firestoreAdmin) {
    await firestoreAdmin.collection("users").doc(userId).update({ tokenBalance: newTokenBalance });
  } else {
    // Firebase Admin SDK is not initialized. Anonymous mode
    return 0;
  }
  return newTokenBalance;
}

async function getUserTokenBalance(userId: string): Promise<number> {
  try {
    if (firestoreAdmin && authEnabled) {
      const userDoc = await firestoreAdmin.collection("users").doc(userId).get();
      const userData = userDoc.data();
      return userData ? userData.tokenBalance : 0;
    } else {
      return 0;
    }
  } catch (error: any) {
    if (error.code === 'app/no-app') {
      // Firebase Admin SDK is not initialized. Anonymous mode
      return 0;
    } else {
      // Some other error occurred
      throw error;
    }
  }
}

async function getImages(): Promise<any> {
  try {
    if (firestoreAdmin && authEnabled) {
      return await firestoreAdmin.collection('images').get();
    } else {
      return [];
    }
  } catch (error: any) {
    if (error.code === 'app/no-app') {
      // Firebase Admin SDK is not initialized. Anonymous mode
      return [];
    } else {
      // Some other error occurred
      throw error;
    }
  }
  return [];
}

async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    if (firestoreAdmin && authEnabled) {
      const userDoc = await firestoreAdmin.collection("users").doc(userId).get();
      const userData = userDoc.data();
      return userData ? userData.isAdmin : false;
    } else {
      return true;
    }
  } catch (error: any) {
    if (error.code === 'app/no-app') {
      // Firebase Admin SDK is not initialized. Anonymous mode
      return true;
    } else {
      // Some other error occurred
      throw error;
    }
  }
}

export { admin, firestoreAdmin, isUserAdmin, getUserDetails, getUserTokenBalance, updateTokenBalance, getImages };
