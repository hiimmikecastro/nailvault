// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDGJqH1EKjVyth2K40UjIgBKg0J6q3bcVc",
  authDomain: "nailvault-ca8d5.firebaseapp.com",
  projectId: "nailvault-ca8d5",
  storageBucket: "nailvault-ca8d5.firebasestorage.app",
  messagingSenderId: "987905120604",
  appId: "1:987905120604:web:bf813670415b6eb8ce4999",
  measurementId: "G-BVQ8GWFYRT",
};

const app = initializeApp(firebaseConfig);

// Anonymous Auth
export const auth = getAuth(app);
export async function ensureAnonAuth() {
  if (!auth.currentUser) await signInAnonymously(auth);
  return new Promise((resolve) =>
    onAuthStateChanged(auth, () => resolve(auth.currentUser))
  );
}

// Firestore
export const db = getFirestore(app);

// Re-exports for convenience
export {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
};
