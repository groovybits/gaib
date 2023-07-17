import firebase from "@/config/firebaseClientInit";

const authEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTH === "true" ? true : false;

export default async function isUserPremium(): Promise<boolean> {
  if (!authEnabled && firebase.app.length == 0) {
    return true;
  }
  await firebase.auth().currentUser?.getIdToken(true);
  const decodedToken = await firebase.auth().currentUser?.getIdTokenResult();

  return decodedToken?.claims?.stripeRole ? true : false;
}
