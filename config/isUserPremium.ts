import firebase from "@/config/firebaseClientInit";

export default async function isUserPremium(): Promise<boolean> {
  await firebase.auth().currentUser?.getIdToken(true);
  const decodedToken = await firebase.auth().currentUser?.getIdTokenResult();

  return decodedToken?.claims?.stripeRole ? true : false;
}
