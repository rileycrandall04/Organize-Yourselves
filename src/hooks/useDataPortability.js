import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { getDataStats } from '../utils/dataPortability';
import { getProfile } from '../db';

// ── Data Statistics ──────────────────────────────────────────

export function useDataStats() {
  const result = useLiveQuery(async () => {
    return await getDataStats();
  });

  return {
    stats: result?.stats ?? {},
    totalRows: result?.total ?? 0,
    loading: result === undefined,
  };
}

// ── Last Export Date ─────────────────────────────────────────

export function useLastExportDate() {
  const profile = useLiveQuery(() => getProfile());

  if (profile === undefined) {
    return { lastExportDate: null, daysSinceExport: null, loading: true };
  }

  const lastExportDate = profile?.lastExportDate
    ? new Date(profile.lastExportDate)
    : null;

  let daysSinceExport = null;
  if (lastExportDate) {
    const now = new Date();
    const diffMs = now - lastExportDate;
    daysSinceExport = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  const backupDismissedAt = profile?.backupReminderDismissedAt
    ? new Date(profile.backupReminderDismissedAt)
    : null;

  let daysSinceDismiss = null;
  if (backupDismissedAt) {
    const now = new Date();
    const diffMs = now - backupDismissedAt;
    daysSinceDismiss = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  // Show reminder if: never exported OR 30+ days since export,
  // AND (never dismissed OR 30+ days since dismiss)
  const shouldShowReminder =
    (daysSinceExport === null || daysSinceExport >= 30) &&
    (daysSinceDismiss === null || daysSinceDismiss >= 30);

  return {
    lastExportDate,
    daysSinceExport,
    shouldShowReminder,
    loading: false,
  };
}
