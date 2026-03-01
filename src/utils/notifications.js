/**
 * Push notification management for meeting reminders.
 *
 * - Requests notification permission
 * - Registers FCM service worker and gets push token
 * - Handles foreground messages
 * - Stores token + enabled state in localStorage
 */
import {
  getFirebaseMessaging,
  getFirebaseConfig,
  getToken,
  onMessage,
} from './firebase';

const NOTIF_STATE_KEY = 'organize_notifications';

// ── State Management ─────────────────────────────────────────

export function getNotificationState() {
  try {
    const raw = localStorage.getItem(NOTIF_STATE_KEY);
    return raw ? JSON.parse(raw) : { enabled: false, token: null };
  } catch {
    return { enabled: false, token: null };
  }
}

function saveNotificationState(state) {
  localStorage.setItem(NOTIF_STATE_KEY, JSON.stringify(state));
}

export function isNotificationsEnabled() {
  return getNotificationState().enabled;
}

// ── Permission & Registration ────────────────────────────────

export function isNotificationSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function getPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default', 'granted', 'denied'
}

/**
 * Request notification permission, register FCM SW, and get push token.
 * Returns { success, token, error? }
 */
export async function enableNotifications(vapidKey) {
  if (!isNotificationSupported()) {
    return { success: false, error: 'Push notifications are not supported in this browser.' };
  }

  // 1. Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, error: 'Notification permission was denied.' };
  }

  // 2. Register the Firebase messaging service worker
  let swRegistration;
  try {
    swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/firebase-cloud-messaging-push-scope',
    });
    // Wait for SW to be ready
    await navigator.serviceWorker.ready;
  } catch (err) {
    return { success: false, error: `Service worker registration failed: ${err.message}` };
  }

  // 3. Get FCM token
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return { success: false, error: 'Firebase messaging not initialized. Check your Firebase config.' };
  }

  try {
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      return { success: false, error: 'Could not get push token. Try again later.' };
    }

    // Save state
    saveNotificationState({ enabled: true, token });

    // Set up foreground handler
    setupForegroundHandler();

    return { success: true, token };
  } catch (err) {
    return { success: false, error: `Token registration failed: ${err.message}` };
  }
}

/**
 * Disable notifications (clear token, update state).
 */
export function disableNotifications() {
  saveNotificationState({ enabled: false, token: null });
}

// ── Foreground Message Handler ───────────────────────────────

let _foregroundUnsubscribe = null;

export function setupForegroundHandler() {
  if (_foregroundUnsubscribe) return; // Already set up

  const messaging = getFirebaseMessaging();
  if (!messaging) return;

  _foregroundUnsubscribe = onMessage(messaging, (payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};

    // Show a browser notification even when the app is in the foreground
    if (Notification.permission === 'granted') {
      new Notification(notification.title || 'Meeting Reminder', {
        body: notification.body || data.body || 'You have an upcoming meeting',
        icon: '/icon-192.png',
        tag: 'meeting-reminder-fg',
      });
    }
  });
}

/**
 * Initialize notifications on app startup if previously enabled.
 */
export function initNotificationsOnStartup() {
  const state = getNotificationState();
  if (state.enabled && Notification.permission === 'granted') {
    setupForegroundHandler();
  }
}
