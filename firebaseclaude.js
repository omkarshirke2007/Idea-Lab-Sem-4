// firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// FIX: Use the full config — missing fields (appId, storageBucket, messagingSenderId)
// were causing Firestore to fail silently on connection.
const firebaseConfig = {
  apiKey: "AIzaSyDRuYClh3Soc3FgYPtNxdeAQ7bzB02GDzg",
  authDomain: "sicd-eeb40.firebaseapp.com",
  projectId: "sicd-eeb40",
  storageBucket: "sicd-eeb40.firebasestorage.app",
  messagingSenderId: "874247805240",
  appId: "1:874247805240:web:f020a0d592d08e1fabc9cd",
  measurementId: "G-QFZE3F08ME",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
