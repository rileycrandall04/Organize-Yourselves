/**
 * Cloud sync layer — syncs Dexie (IndexedDB) data to Firestore.
 *
 * Strategy:
 * - On first login: migrate existing local data to Firestore
 * - On each write: fire-and-forget push to Firestore
 * - On every login: pull all cloud data into Dexie (cross-device sync)
 *
 * Firestore structure: /users/{uid}/{tableName}/{docId}
 */
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import db from '../db';

// All Dexie tables to sync (writes pushed on every save)
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
  'tasks',
  'meetingTaskStatuses',
  'journalLists',
  'journalMeetingTags',
];


let _uid = null;
let _unsubscribers = [];
let _migrated = false;
let _syncReady = false;
let _syncReadyResolvers = [];

/**
 * Returns a promise that resolves when the initial cloud sync is complete.
 * This prevents the app from showing onboarding before cloud data is pulled.
 */
export function waitForCloudSync() {
  if (_syncReady) return Promise.resolve();
  return new Promise(resolve => {
    _syncReadyResolvers.push(resolve);
  });
}

/**
 * Returns whether the initial cloud sync has completed.
 */
export function isCloudSyncReady() {
  return _syncReady;
}

function markSyncReady() {
  _syncReady = true;
  for (const resolve of _syncReadyResolvers) resolve();
  _syncReadyResolvers = [];
}

/**
 * Initialize cloud sync for an authenticated user.
 * Called once when the user logs in.
 */
export async function initCloudSync(uid) {
  if (_uid === uid) {
    // Already initialized — wait for the first call to finish naturally.
    // Don't prematurely mark sync ready; the original call's finally block
    // will call markSyncReady() once the pull actually completes.
    return;
  }
  _uid = uid;
  _syncReady = false;

  try {
    const firestore = getFirebaseFirestore();
    if (!firestore) {
      markSyncReady();
      return;
    }

    try {
      // Check if this device has synced before
      const hasSynced = localStorage.getItem(`organize_synced_${uid}`);

      if (!hasSynced) {
        // First time: check if cloud has data
        const cloudHasData = await checkCloudHasData(uid);

        if (cloudHasData) {
          // New device or cache cleared — pull from cloud
          console.log('[CloudSync] Cache cleared or new device detected — pulling from cloud...');
          await pullFromCloud(uid);
        } else {
          // First device — push local to cloud
          await migrateLocalToCloud(uid);
        }

        localStorage.setItem(`organize_synced_${uid}`, '1');
      } else {
        // Device has synced before — always pull latest data from cloud
        // to ensure cross-device changes (e.g. phone → PC) are reflected.
        console.log('[CloudSync] Pulling latest data from cloud...');
        await pullFromCloud(uid);
      }
    } catch (err) {
      console.warn('[CloudSync] Init error:', err.message);
    }

    // No real-time listeners — push-on-write + pull-on-login sync.
    // Data is pushed to cloud on every save. Full pull happens on
    // every login to ensure cross-device data is current.
  } catch (err) {
    console.warn('[CloudSync] Fatal init error:', err.message);
  } finally {
    // ALWAYS mark sync as ready so the app can proceed
    markSyncReady();
  }
}

/**
 * Reset cloud sync state. Must be called on sign-out so that
 * re-login properly re-initializes sync (including real-time listeners).
 */
export function resetCloudSync() {
  stopRealtimeSync();
  _uid = null;
  _migrated = false;
  _syncReady = false;
  _syncReadyResolvers = [];
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
 * Verify that critical local tables (profile, userCallings) exist.
 * If they are empty but cloud has data, re-pull everything from cloud.
 * This handles the case where IndexedDB was evicted but localStorage persists.
 */
async function ensureCriticalDataExists(uid) {
  try {
    const profileCount = await db.profile.count();
    const callingsCount = await db.userCallings.count();

    if (profileCount === 0 || callingsCount === 0) {
      // Local data is missing — check if cloud has it
      const cloudHasData = await checkCloudHasData(uid);
      if (cloudHasData) {
        console.log('[CloudSync] Local data missing but cloud has data — re-pulling...');
        await pullFromCloud(uid);
      }
    }
  } catch (err) {
    console.warn('[CloudSync] Error checking critical data:', err.message);
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

      // Clear and replace atomically so useLiveQuery never sees empty state
      await db.transaction('rw', table, async () => {
        await table.clear();
        await table.bulkPut(rows);
      });

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
  if (!_uid) {
    console.warn(`[CloudSync] Push skipped for ${tableName}/${id}: no authenticated user`);
    return;
  }
  const firestore = getFirebaseFirestore();
  if (!firestore) {
    console.warn(`[CloudSync] Push skipped for ${tableName}/${id}: Firestore not initialized`);
    return;
  }

  try {
    const docRef = doc(firestore, `users/${_uid}/${tableName}`, String(id));
    await setDoc(docRef, sanitizeForFirestore(data));
  } catch (err) {
    console.error(`[CloudSync] Push FAILED for ${tableName}/${id}:`, err.message, err);
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
 * Stop all real-time listeners (no-op — listeners removed for quota savings).
 */
export function stopRealtimeSync() {
  for (const unsub of _unsubscribers) {
    try { unsub(); } catch {}
  }
  _unsubscribers = [];
}

/**
 * Force a full sync: push ALL local Dexie data to Firestore.
 * Stamps updatedAt on all records so they're protected from stale overwrites.
 * Use after deploying Firestore rules or to recover from sync failures.
 * Returns a status object with success/failure details.
 */
export async function forceFullSync() {
  if (!_uid) return { success: false, error: 'Not authenticated' };
  const firestore = getFirebaseFirestore();
  if (!firestore) return { success: false, error: 'Firestore not available' };

  const results = { success: true, tables: {}, errors: [] };
  const now = new Date().toISOString();

  for (const tableName of SYNC_TABLES) {
    try {
      const table = db[tableName];
      if (!table) continue;

      const rows = await table.toArray();
      if (rows.length === 0) {
        results.tables[tableName] = 0;
        continue;
      }

      // Stamp updatedAt on all records that don't have it yet
      for (const row of rows) {
        if (!row.updatedAt) {
          row.updatedAt = now;
          await table.update(row.id, { updatedAt: now });
        }
      }

      // Use batched writes (max 500 per batch)
      const batchSize = 450;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const chunk = rows.slice(i, i + batchSize);

        for (const row of chunk) {
          const docId = String(row.id);
          const docRef = doc(firestore, `users/${_uid}/${tableName}`, docId);
          batch.set(docRef, sanitizeForFirestore(row));
        }

        await batch.commit();
      }

      results.tables[tableName] = rows.length;
    } catch (err) {
      results.success = false;
      results.errors.push(`${tableName}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Test if Firestore writes work by writing and reading a test document.
 * Returns { success, error? }
 */
export async function testCloudConnection() {
  if (!_uid) return { success: false, error: 'Not authenticated — sign in first' };
  const firestore = getFirebaseFirestore();
  if (!firestore) return { success: false, error: 'Firestore not initialized' };

  try {
    const testRef = doc(firestore, `users/${_uid}/profile`, '_sync_test');
    await setDoc(testRef, { test: true, timestamp: new Date().toISOString() });
    // Read it back
    const snap = await getDocs(collection(firestore, `users/${_uid}/profile`));
    const found = snap.docs.some(d => d.id === '_sync_test');
    // Clean up
    await deleteDoc(testRef);

    if (found) {
      return { success: true };
    } else {
      return { success: false, error: 'Write succeeded but read failed — check Firestore rules' };
    }
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes('PERMISSION_DENIED') || msg.includes('Missing or insufficient permissions')) {
      return {
        success: false,
        error: 'Firestore security rules are blocking writes. Deploy rules with: firebase deploy --only firestore:rules',
      };
    }
    return { success: false, error: msg };
  }
}

/**
 * Delete ALL cloud data for the current user.
 * Iterates every synced table collection and batch-deletes all documents.
 * Returns { success, deleted, errors }
 */
export async function deleteAllCloudData() {
  if (!_uid) return { success: false, error: 'Not authenticated' };
  const firestore = getFirebaseFirestore();
  if (!firestore) return { success: false, error: 'Firestore not initialized' };

  // Stop real-time listeners first so they don't re-pull deleted data
  _unsubscribers.forEach(unsub => { try { unsub(); } catch {} });
  _unsubscribers = [];

  let totalDeleted = 0;
  const errors = [];

  for (const tableName of SYNC_TABLES) {
    try {
      const colRef = collection(firestore, `users/${_uid}/${tableName}`);
      const snap = await getDocs(colRef);
      if (snap.empty) continue;

      // Batch delete (max 500 per batch)
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 450) {
        const batch = writeBatch(firestore);
        const chunk = docs.slice(i, i + 450);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
        totalDeleted += chunk.length;
      }
    } catch (err) {
      errors.push(`${tableName}: ${err.message}`);
    }
  }

  // Also delete the firestoreSync data (meeting schedule, notification tokens, etc.)
  try {
    const syncRef = collection(firestore, `users/${_uid}/firestoreSync`);
    const syncSnap = await getDocs(syncRef);
    if (!syncSnap.empty) {
      const batch = writeBatch(firestore);
      syncSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      totalDeleted += syncSnap.size;
    }
  } catch {}

  console.log(`[CloudSync] Deleted ${totalDeleted} cloud documents`);

  return {
    success: errors.length === 0,
    deleted: totalDeleted,
    errors,
  };
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
