import db from '../db';

// ── Constants ────────────────────────────────────────────────

const APP_NAME = 'Organize Yourselves';
const CURRENT_APP_VERSION = '0.3.0';
const CURRENT_SCHEMA_VERSION = 2;

const ALL_TABLES = [
  'profile',
  'userCallings',
  'responsibilities',
  'people',
  'callingSlots',
  'meetings',
  'meetingInstances',
  'actionItems',
  'inbox',
  'journal',
  'lessons',
  'events',
  'receipts',
  'meetingNoteTags',
];

const TABLE_LABELS = {
  profile: 'Profile',
  userCallings: 'Callings',
  responsibilities: 'Responsibilities',
  people: 'People',
  callingSlots: 'Calling Pipeline',
  meetings: 'Meetings',
  meetingInstances: 'Meeting Notes',
  actionItems: 'Action Items',
  inbox: 'Inbox',
  journal: 'Journal',
  lessons: 'Lessons',
  events: 'Events',
  receipts: 'Receipts',
  meetingNoteTags: 'Meeting Tags',
};

// ── Export ────────────────────────────────────────────────────

export async function exportAllData() {
  const data = {};
  const tables = [];

  for (const tableName of ALL_TABLES) {
    if (db[tableName]) {
      const rows = await db[tableName].toArray();
      data[tableName] = rows;
      if (rows.length > 0) tables.push(tableName);
    }
  }

  return {
    meta: {
      appName: APP_NAME,
      version: CURRENT_APP_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportDate: new Date().toISOString(),
      tables,
    },
    data,
  };
}

// ── Validate Import Data ─────────────────────────────────────

export function validateImportData(jsonObj) {
  const errors = [];
  const warnings = [];
  const stats = {};

  // Gate 1: Has meta + data keys
  if (!jsonObj || typeof jsonObj !== 'object') {
    errors.push('File does not contain valid data.');
    return { valid: false, errors, warnings, stats };
  }

  if (!jsonObj.meta || !jsonObj.data) {
    errors.push('File is missing required "meta" or "data" sections.');
    return { valid: false, errors, warnings, stats };
  }

  // Gate 2: App identity
  if (jsonObj.meta.appName !== APP_NAME) {
    errors.push(`This file is from "${jsonObj.meta.appName || 'unknown'}", not "${APP_NAME}".`);
    return { valid: false, errors, warnings, stats };
  }

  // Gate 3: Schema version
  const fileVersion = jsonObj.meta.schemaVersion;
  if (typeof fileVersion !== 'number') {
    warnings.push('File does not specify a schema version. Proceeding with caution.');
  } else if (fileVersion > CURRENT_SCHEMA_VERSION) {
    errors.push(
      `This backup is from a newer version (schema v${fileVersion}). ` +
      `Please update the app first (current: v${CURRENT_SCHEMA_VERSION}).`
    );
    return { valid: false, errors, warnings, stats };
  } else if (fileVersion < CURRENT_SCHEMA_VERSION) {
    warnings.push(
      `This backup is from an older version (schema v${fileVersion}). ` +
      `Some newer tables may be empty after import.`
    );
  }

  // Gate 4: Table validation
  const dataKeys = Object.keys(jsonObj.data);
  for (const key of dataKeys) {
    if (!ALL_TABLES.includes(key)) {
      warnings.push(`Unknown table "${key}" will be skipped.`);
      continue;
    }
    if (!Array.isArray(jsonObj.data[key])) {
      errors.push(`Table "${key}" is not an array.`);
      continue;
    }

    // Gate 5: Row-level sanity
    let validRows = 0;
    let invalidRows = 0;
    for (const row of jsonObj.data[key]) {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        validRows++;
      } else {
        invalidRows++;
      }
    }

    stats[key] = validRows;
    if (invalidRows > 0) {
      warnings.push(`${invalidRows} invalid row(s) in "${key}" will be skipped.`);
    }
  }

  // Check for missing tables (tables in ALL_TABLES but not in import data)
  for (const tableName of ALL_TABLES) {
    if (!jsonObj.data[tableName]) {
      stats[tableName] = 0;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

// ── Import ───────────────────────────────────────────────────

export async function importAllData(jsonObj) {
  const tableRefs = ALL_TABLES.filter(t => db[t]).map(t => db[t]);
  const imported = {};

  await db.transaction('rw', tableRefs, async () => {
    for (const tableName of ALL_TABLES) {
      if (!db[tableName]) continue;

      // Clear existing data
      await db[tableName].clear();

      // Import rows (only valid objects)
      const rows = jsonObj.data[tableName];
      if (rows && Array.isArray(rows)) {
        const validRows = rows.filter(
          r => r && typeof r === 'object' && !Array.isArray(r)
        );
        if (validRows.length > 0) {
          await db[tableName].bulkPut(validRows);
        }
        imported[tableName] = validRows.length;
      } else {
        imported[tableName] = 0;
      }
    }
  });

  return { success: true, imported };
}

// ── File Helpers ─────────────────────────────────────────────

export function downloadJsonFile(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        resolve(parsed);
      } catch (err) {
        reject(new Error('File is not valid JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

export function getExportFilename() {
  const date = new Date().toISOString().split('T')[0];
  return `organize-yourselves-backup-${date}.json`;
}

// ── Data Stats ───────────────────────────────────────────────

export async function getDataStats() {
  const stats = {};
  let total = 0;

  for (const tableName of ALL_TABLES) {
    if (db[tableName]) {
      const count = await db[tableName].count();
      stats[tableName] = count;
      total += count;
    }
  }

  return { stats, total };
}

// ── Share Helper ─────────────────────────────────────────────

export function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const testFile = new File(['test'], 'test.json', { type: 'application/json' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

export async function shareBackupFile(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });

  await navigator.share({
    title: 'Organize Yourselves Backup',
    text: `Backup from ${new Date().toLocaleDateString()}`,
    files: [file],
  });
}

// ── Exports for labels ───────────────────────────────────────

export function getTableLabel(key) {
  return TABLE_LABELS[key] || key;
}

export { ALL_TABLES, TABLE_LABELS, CURRENT_APP_VERSION };
