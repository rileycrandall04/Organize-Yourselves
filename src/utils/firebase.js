/**
 * Firebase configuration and initialization.
 * Config is stored in localStorage (like AI config) so the user
 * can enter their Firebase project details through Settings.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFirestore } from 'firebase/firestore';

const FIREBASE_CONFIG_KEY = 'organize_firebase_config';

// ── Config Management (localStorage) ─────────────────────────

export function getFirebaseConfig() {
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveFirebaseConfig(config) {
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

export function clearFirebaseConfig() {
  localStorage.removeItem(FIREBASE_CONFIG_KEY);
}

export function isFirebaseConfigured() {
  const config = getFirebaseConfig();
  return !!(config?.apiKey && config?.projectId && config?.messagingSenderId);
}

// ── Lazy Firebase Initialization ─────────────────────────────

let _app = null;
let _messaging = null;
let _firestore = null;

export function getFirebaseApp() {
  if (_app) return _app;

  const config = getFirebaseConfig();
  if (!config) return null;

  if (getApps().length > 0) {
    _app = getApp();
  } else {
    _app = initializeApp(config);
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

// Reset instances when config changes
export function resetFirebaseInstances() {
  _app = null;
  _messaging = null;
  _firestore = null;
}

// Re-export for convenience
export { getToken, onMessage };
