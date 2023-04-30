import { useState, useEffect } from "react";
import firebase from "@/config/firebaseClientInit";
import isUserPremium from "@/config/isUserPremium";

export default function usePremiumStatus(user: firebase.User | null | undefined) {
  const [premiumStatus, setPremiumStatus] = useState<boolean>(false);

  useEffect(() => {
    if (user) {
      const checkPremiumStatus = async function () {
        setPremiumStatus(await isUserPremium());
      };
      checkPremiumStatus();
    }
  }, [user]);

  return premiumStatus;
}
