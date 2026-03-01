/**
 * Cloud sync layer — syncs Dexie (IndexedDB) data to Firestore.
 *
 * Strategy:
 * - On first login: migrate existing local data to Firestore
 * - On each write: fire-and-forget push to Firestore
 * - On login from new device: pull cloud data into Dexie
 * - Real-time sync via onSnapshot listeners for cross-device updates
 *
 * Firestore structure: /users/{uid}/{tableName}/{docId}
 */
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import db from '../db';

// All Dexie tables to sync
const SYNC_TABLES = [
  'profile',
  'userCallings',
  'meetings',
  'meetingInstances',
  'actionItems',
  'callingSlots',
  'people',
  'inbox',
  'journal',
  'meetingNoteTags',
  'responsibilities',
  'lessons',
  'events',
  'receipts',
  'ministeringCompanionships',
  'ministeringInterviews',
  'ongoingTasks',
  'ministeringPlans',
];

let _uid = null;
let _unsubscribers = [];
let _migrated = false;

/**
 * Initialize cloud sync for an authenticated user.
 * Called once when the user logs in.
 */
export async function initCloudSync(uid) {
  if (_uid === uid) return; // Already initialized
  _uid = uid;

  const firestore = getFirebaseFirestore();
  if (!firestore) return;

  // Check if this device has synced before
  const hasSynced = localStorage.getItem(`organize_synced_${uid}`);

  if (!hasSynced) {
    // First time: check if cloud has data
    const cloudHasData = await checkCloudHasData(uid);

    if (cloudHasData) {
      // New device — pull from cloud
      await pullFromCloud(uid);
    } else {
      // First device — push local to cloud
      await migrateLocalToCloud(uid);
    }

    localStorage.setItem(`organize_synced_${uid}`, '1');
  }

  // Start real-time sync
  startRealtimeSync(uid);
}

/**
 * Check if the user has any data in Firestore.
 */
async function checkCloudHasData(uid) {
  const firestore = getFirebaseFirestore();
  if (!firestore) return false;

  try {
    const profileSnap = await getDocs(collection(firestore, `users/${uid}/profile`));
    return !profileSnap.empty;
  } catch {
    return false;
  }
}

/**
 * One-time migration: upload all local Dexie data to Firestore.
 */
export async function migrateLocalToCloud(uid) {
  const firestore = getFirebaseFirestore();
  if (!firestore || _migrated) return;
  _migrated = true;

  console.log('[CloudSync] Migrating local data to cloud...');

  for (const tableName of SYNC_TABLES) {
    try {
      const table = db[tableName];
      if (!table) continue;

      const rows = await table.toArray();
      if (rows.length === 0) continue;

      // Use batched writes (max 500 per batch)
      const batchSize = 450;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const chunk = rows.slice(i, i + batchSize);

        for (const row of chunk) {
          const docId = String(row.id);
          const docRef = doc(firestore, `users/${uid}/${tableName}`, docId);
          batch.set(docRef, sanitizeForFirestore(row));
        }

        await batch.commit();
      }

      console.log(`[CloudSync] Migrated ${rows.length} ${tableName} records`);
    } catch (err) {
      console.warn(`[CloudSync] Failed to migrate ${tableName}:`, err.message);
    }
  }

  console.log('[CloudSync] Migration complete');
}

/**
 * Pull all Firestore data into Dexie (new device sync).
 */
export async function pullFromCloud(uid) {
  const firestore = getFirebaseFirestore();
  if (!firestore) return;

  console.log('[CloudSync] Pulling data from cloud...');

  for (const tableName of SYNC_TABLES) {
    try {
      const table = db[tableName];
      if (!table) continue;

      const snap = await getDocs(collection(firestore, `users/${uid}/${tableName}`));
      if (snap.empty) continue;

      const rows = snap.docs.map(d => {
        const data = d.data();
        // Restore numeric ID
        const id = parseInt(d.id, 10);
        return { ...data, id: isNaN(id) ? d.id : id };
      });

      // Clear existing local data and replace with cloud data
      await table.clear();
      await table.bulkPut(rows);

      console.log(`[CloudSync] Pulled ${rows.length} ${tableName} records`);
    } catch (err) {
      console.warn(`[CloudSync] Failed to pull ${tableName}:`, err.message);
    }
  }

  console.log('[CloudSync] Pull complete');
}

/**
 * Push a single record to Firestore.
 * Called after each Dexie write. Fire-and-forget.
 */
export async function pushToCloud(tableName, id, data) {
  if (!_uid) return;
  const firestore = getFirebaseFirestore();
  if (!firestore) return;

  try {
    const docRef = doc(firestore, `users/${_uid}/${tableName}`, String(id));
    await setDoc(docRef, sanitizeForFirestore(data));
  } catch (err) {
    console.warn(`[CloudSync] Push failed for ${tableName}/${id}:`, err.message);
  }
}

/**
 * Delete a record from Firestore.
 */
export async function deleteFromCloud(tableName, id) {
  if (!_uid) return;
  const firestore = getFirebaseFirestore();
  if (!firestore) return;

  try {
    const docRef = doc(firestore, `users/${_uid}/${tableName}`, String(id));
    await deleteDoc(docRef);
  } catch (err) {
    console.warn(`[CloudSync] Delete failed for ${tableName}/${id}:`, err.message);
  }
}

/**
 * Set up onSnapshot listeners for real-time cross-device sync.
 */
function startRealtimeSync(uid) {
  // Clean up any existing listeners
  stopRealtimeSync();

  const firestore = getFirebaseFirestore();
  if (!firestore) return;

  // Only listen to tables that change frequently
  const realtimeTables = [
    'actionItems',
    'meetings',
    'meetingInstances',
    'inbox',
    'ongoingTasks',
    'ministeringPlans',
    'callingSlots',
  ];

  for (const tableName of realtimeTables) {
    try {
      const colRef = collection(firestore, `users/${uid}/${tableName}`);
      const unsub = onSnapshot(colRef, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          const table = db[tableName];
          if (!table) return;

          const data = change.doc.data();
          const id = parseInt(change.doc.id, 10);
          const docId = isNaN(id) ? change.doc.id : id;

          try {
            if (change.type === 'added' || change.type === 'modified') {
              await table.put({ ...data, id: docId });
            } else if (change.type === 'removed') {
              await table.delete(docId);
            }
          } catch {
            // Silently handle sync conflicts
          }
        });
      }, (err) => {
        console.warn(`[CloudSync] Listener error for ${tableName}:`, err.message);
      });

      _unsubscribers.push(unsub);
    } catch (err) {
      console.warn(`[CloudSync] Failed to start listener for ${tableName}:`, err.message);
    }
  }
}

/**
 * Stop all real-time listeners.
 */
export function stopRealtimeSync() {
  for (const unsub of _unsubscribers) {
    try { unsub(); } catch {}
  }
  _unsubscribers = [];
}

/**
 * Clean Dexie data for Firestore (remove undefined values, convert types).
 */
function sanitizeForFirestore(obj) {
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value instanceof Date) {
      clean[key] = value.toISOString();
    } else if (Array.isArray(value)) {
      clean[key] = value.map(v =>
        v && typeof v === 'object' && !(v instanceof Date) ? sanitizeForFirestore(v) : v ?? null
      );
    } else if (value && typeof value === 'object') {
      clean[key] = sanitizeForFirestore(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}
