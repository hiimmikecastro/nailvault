// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";

// paste your config from Firebase console here:
const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "YOUR_APP.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_APP.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export async function ensureAnonAuth() {
  if (!auth.currentUser) await signInAnonymously(auth);
  return new Promise((resolve) => onAuthStateChanged(auth, () => resolve(auth.currentUser)));
}

export {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp
};
