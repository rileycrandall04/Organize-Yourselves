/**
 * Firebase configuration and initialization.
 * Config is hardcoded — Firebase web API keys are designed to be public.
 * Security is enforced via Firestore rules, not key secrecy.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';

// ── Hardcoded Firebase Config ───────────────────────────────

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA6L5TqBG6tAODLI_BsCqXG-NVnHYY9KkA',
  authDomain: 'organize-yourselves.firebaseapp.com',
  projectId: 'organize-yourselves',
  storageBucket: 'organize-yourselves.firebasestorage.app',
  messagingSenderId: '148134450489',
  appId: '1:148134450489:web:e8d744d1ede81004c084e8',
  vapidKey: 'BDK5ul9kYOrgyEnBpgr5rqxhbxptlbz2_d9F8lMwM8zoFLpwUbx_Wq70jVVnaBpi6rGMi9U_21pvJb2YOZyjqi8',
};

export function getFirebaseConfig() {
  return FIREBASE_CONFIG;
}

export function isFirebaseConfigured() {
  return true;
}

export function getVapidKey() {
  return FIREBASE_CONFIG.vapidKey;
}

// No-ops for backward compatibility
export function saveFirebaseConfig() {}
export function clearFirebaseConfig() {}

// ── Lazy Firebase Initialization ─────────────────────────────

let _app = null;
let _messaging = null;
let _firestore = null;

export function getFirebaseApp() {
  if (_app) return _app;

  if (getApps().length > 0) {
    _app = getApp();
  } else {
    _app = initializeApp(FIREBASE_CONFIG);
  }
  return _app;
}

export function getFirebaseMessaging() {
  if (_messaging) return _messaging;

  const app = getFirebaseApp();
  if (!app) return null;

  try {
    _messaging = getMessaging(app);
    return _messaging;
  } catch (err) {
    console.warn('[Firebase] Messaging not supported:', err.message);
    return null;
  }
}

export function getFirebaseFirestore() {
  if (_firestore) return _firestore;

  const app = getFirebaseApp();
  if (!app) return null;

  _firestore = getFirestore(app);
  return _firestore;
}

// ── Auth ─────────────────────────────────────────────────────

let _auth = null;

export function getFirebaseAuth() {
  if (_auth) return _auth;

  const app = getFirebaseApp();
  if (!app) return null;

  _auth = getAuth(app);
  return _auth;
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase not initialized');

  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await firebaseSignOut(auth);
}

export function onAuthChange(callback) {
  const auth = getFirebaseAuth();
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

// Re-export for convenience
export { getToken, onMessage };
