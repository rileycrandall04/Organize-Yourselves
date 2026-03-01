/**
 * Firestore sync for push notification data.
 *
 * Syncs minimal data to Firestore so Cloud Functions can send
 * daily meeting reminders:
 * - User's FCM token
 * - Meeting templates with next calculated dates
 *
 * All app data remains in IndexedDB (Dexie). Firestore is ONLY
 * used for the notification pipeline.
 */
import {
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseFirestore, isFirebaseConfigured } from './firebase';
import { getNotificationState } from './notifications';
import { getUpcomingMeetings } from '../db';

// Device ID for this browser (stable across sessions)
function getDeviceId() {
  let id = localStorage.getItem('organize_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('organize_device_id', id);
  }
  return id;
}

/**
 * Sync meeting schedule + FCM token to Firestore.
 * Called when:
 * - Notifications are enabled
 * - A meeting is created/updated/deleted
 * - A meeting instance is recorded (updates next date)
 */
export async function syncMeetingSchedule() {
  if (!isFirebaseConfigured()) return;

  const { enabled, token } = getNotificationState();
  if (!enabled || !token) return;

  const db = getFirebaseFirestore();
  if (!db) return;

  try {
    const meetings = await getUpcomingMeetings();
    const deviceId = getDeviceId();

    // Build minimal meeting data for Cloud Functions
    const meetingData = meetings
      .filter(m => m.nextDate) // Only meetings with a calculated next date
      .map(m => ({
        id: m.id,
        name: m.name,
        cadence: m.cadence,
        nextDate: m.nextDate,
      }));

    await setDoc(doc(db, 'devices', deviceId), {
      fcmToken: token,
      meetings: meetingData,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[FirestoreSync] Failed to sync:', err.message);
  }
}

/**
 * Remove this device's data from Firestore.
 * Called when notifications are disabled.
 */
export async function removeSyncData() {
  if (!isFirebaseConfigured()) return;

  const db = getFirebaseFirestore();
  if (!db) return;

  try {
    const deviceId = getDeviceId();
    await deleteDoc(doc(db, 'devices', deviceId));
  } catch (err) {
    console.warn('[FirestoreSync] Failed to remove sync data:', err.message);
  }
}
