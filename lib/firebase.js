// lib/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; 

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDMGRCWXNbsREEpqphcxXjDINvRqPZhDTU",
  authDomain: "werkstatt-hub.firebaseapp.com",
  projectId: "werkstatt-hub",
  storageBucket: "werkstatt-hub.firebasestorage.app",
  messagingSenderId: "697004172905",
  appId: "1:697004172905:web:549fdcc5f26267e8f464f8",
  measurementId: "G-98GVJQHJZQ"
};

// Firebase initialisieren
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app); // <-- NEU