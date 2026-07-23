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

const firebaseConfig = {
  apiKey: "AIzaSyBwhkiNEhtyHSDnbDrEKhZ9Hq1fmr9j-2Y",
  authDomain: "software-jmcs.firebaseapp.com",
  projectId: "software-jmcs",
  storageBucket: "software-jmcs.firebasestorage.app",
  messagingSenderId: "492038530668",
  appId: "1:492038530668:web:4432a57320ad7ca11fda49",
};
const hasConfig = true;

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
