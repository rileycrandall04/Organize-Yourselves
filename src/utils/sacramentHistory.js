/**
 * Sacrament Meeting Assignment History
 * Scans past sacrament meeting programData to track speaker/prayer assignments.
 */
import db from '../db';

/**
 * Scans all sacrament meeting instances that have programData.
 * Returns a map: { lowercaseName → { lastSpoke: Date|null, lastPrayed: Date|null } }
 */
export async function getAssignmentHistory() {
  // Get all meetings named "Sacrament Meeting"
  const sacramentMeetings = await db.meetings
    .filter(m => m.name === 'Sacrament Meeting')
    .toArray();

  if (sacramentMeetings.length === 0) return {};

  const meetingIds = sacramentMeetings.map(m => m.id);

  // Get all instances for those meetings
  const allInstances = await db.meetingInstances.toArray();
  const sacramentInstances = allInstances.filter(
    inst => meetingIds.includes(inst.meetingId) && inst.programData
  );

  const history = {}; // lowercaseName → { lastSpoke, lastPrayed }

  for (const inst of sacramentInstances) {
    const pd = inst.programData;
    const instDate = inst.date ? new Date(inst.date) : null;
    if (!instDate) continue;

    // Check speakers
    if (pd.speakers && Array.isArray(pd.speakers)) {
      for (const speaker of pd.speakers) {
        if (speaker.name && speaker.name.trim()) {
          const key = speaker.name.trim().toLowerCase();
          if (!history[key]) history[key] = { lastSpoke: null, lastPrayed: null };
          if (!history[key].lastSpoke || instDate > history[key].lastSpoke) {
            history[key].lastSpoke = instDate;
          }
        }
      }
    }

    // Check invocation
    if (pd.invocation && pd.invocation.trim()) {
      const key = pd.invocation.trim().toLowerCase();
      if (!history[key]) history[key] = { lastSpoke: null, lastPrayed: null };
      if (!history[key].lastPrayed || instDate > history[key].lastPrayed) {
        history[key].lastPrayed = instDate;
      }
    }

    // Check benediction
    if (pd.benediction && pd.benediction.trim()) {
      const key = pd.benediction.trim().toLowerCase();
      if (!history[key]) history[key] = { lastSpoke: null, lastPrayed: null };
      if (!history[key].lastPrayed || instDate > history[key].lastPrayed) {
        history[key].lastPrayed = instDate;
      }
    }
  }

  return history;
}

/**
 * Check a person's assignment history against a threshold.
 * @param {Object} history - Map from getAssignmentHistory()
 * @param {string} name - Person name to check
 * @param {number} thresholdMonths - Months within which to flag (default 12)
 * @returns {{ type: 'spoke'|'prayed', daysAgo: number, withinThreshold: boolean, label: string }|null}
 */
export function checkPersonHistory(history, name, thresholdMonths = 12) {
  if (!name || !name.trim()) return null;

  const key = name.trim().toLowerCase();
  const record = history[key];
  if (!record) return null;

  const now = new Date();
  const thresholdMs = thresholdMonths * 30.44 * 24 * 60 * 60 * 1000;

  // Check most recent assignment (either speaking or praying)
  const results = [];

  if (record.lastSpoke) {
    const daysAgo = Math.floor((now - record.lastSpoke) / (24 * 60 * 60 * 1000));
    const withinThreshold = (now - record.lastSpoke) < thresholdMs;
    const monthsAgo = Math.floor(daysAgo / 30.44);
    results.push({
      type: 'spoke',
      daysAgo,
      withinThreshold,
      label: daysAgo < 30
        ? `Spoke ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`
        : `Spoke ${monthsAgo} month${monthsAgo !== 1 ? 's' : ''} ago`,
    });
  }

  if (record.lastPrayed) {
    const daysAgo = Math.floor((now - record.lastPrayed) / (24 * 60 * 60 * 1000));
    const withinThreshold = (now - record.lastPrayed) < thresholdMs;
    const monthsAgo = Math.floor(daysAgo / 30.44);
    results.push({
      type: 'prayed',
      daysAgo,
      withinThreshold,
      label: daysAgo < 30
        ? `Prayed ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`
        : `Prayed ${monthsAgo} month${monthsAgo !== 1 ? 's' : ''} ago`,
    });
  }

  if (results.length === 0) return null;

  // Return the most recent assignment
  results.sort((a, b) => a.daysAgo - b.daysAgo);
  return results[0];
}
