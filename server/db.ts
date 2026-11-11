import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  type Firestore,
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  runTransaction,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  increment,
  writeBatch,
  setLogLevel
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

// Initialize Firebase App for Server
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// CRITICAL: Initialize Firestore with specific database ID from config
export const serverDb: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);

try {
  setLogLevel('silent');
} catch {}

export {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  increment,
  writeBatch
};
