import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  onSnapshot,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, signInWithEmailAndPassword, signOut, setPersistence, sendPasswordResetEmail, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";

const hasConfig = !!(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export let db: ReturnType<typeof initializeFirestore> | undefined;
export let auth: ReturnType<typeof getAuth> | undefined;
export let storage: ReturnType<typeof getStorage> | undefined;

try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  console.error("[debug] Firebase initializeFirestore (persistent cache) failed:", e);
}

try {
  auth = getAuth(app);
} catch (e) {
  console.error("[debug] Firebase getAuth failed:", e);
}

try {
  storage = getStorage(app);
} catch (e) {
  console.error("[debug] Firebase getStorage failed:", e);
}

export {
  collection,
  onSnapshot,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  sendPasswordResetEmail,
  browserLocalPersistence,
  browserSessionPersistence,
  hasConfig,
};
