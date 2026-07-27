import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCQgyufneQYXE8OcDf8YqV8CczexKXs9uM",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "p2p-share-c4006.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "p2p-share-c4006",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "p2p-share-c4006.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1080141012421",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1080141012421:web:328e386719ffe4d67b3fac",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;

if (appCheckSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const firebaseAuth = getAuth(app);
export const firestore = getFirestore(app);

export async function ensureSignalingIdentity() {
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
  return (await signInAnonymously(firebaseAuth)).user;
}
