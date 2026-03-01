/**
 * Cloud Functions for Organize Yourselves
 *
 * sendMeetingReminders — Runs hourly, checks each device's timezone.
 * At 10 AM local time, sends push notifications for upcoming meetings
 * based on cadence-aware reminder windows:
 *   - Weekly/biweekly: 1 day before
 *   - Monthly/nth-Sunday: 1 week before
 *   - Quarterly/biannual/annual: 1 month + 1 week before
 *
 * Per-meeting overrides via reminderDays field are supported.
 *
 * Firestore schema (written by the client app):
 *   /devices/{deviceId}
 *     - fcmToken: string
 *     - timezone: string (IANA, e.g. "America/Denver")
 *     - meetings: Array<{ id, name, cadence, nextDate, reminderDays? }>
 *     - updatedAt: timestamp
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

// ── Reminder Policy ─────────────────────────────────────────

/**
 * Default reminder days based on meeting cadence.
 * Returns array of days-before-meeting when reminders fire.
 */
function getDefaultReminderDays(cadence) {
  switch (cadence) {
    case 'weekly':
    case 'biweekly':
      return [1]; // 1 day before

    case 'monthly':
    case 'first_sunday':
    case 'second_sunday':
    case 'third_sunday':
    case 'fourth_sunday':
      return [7]; // 1 week before

    case 'quarterly':
    case 'biannual':
    case 'annual':
      return [30, 7]; // 1 month + 1 week before

    case 'as_needed':
      return []; // no automatic reminders

    default:
      return [1]; // fallback
  }
}

// ── Timezone Helpers ────────────────────────────────────────

/** Get the current hour (0-23) in a given IANA timezone. */
function getLocalHour(timezone) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(formatter.format(now), 10);
}

/** Get today's date as YYYY-MM-DD in a given IANA timezone. */
function getLocalDate(timezone) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now); // Returns 'YYYY-MM-DD'
}

/** Subtract N days from a YYYY-MM-DD date string. */
function subtractDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z'); // Noon UTC to avoid DST issues
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

/** Human-readable label for days-until. */
function daysLabel(d) {
  if (d === 1) return 'tomorrow';
  if (d === 7) return 'in 1 week';
  if (d === 30) return 'in about 1 month';
  return `in ${d} days`;
}

// ── Cloud Function ──────────────────────────────────────────

/**
 * Runs every hour. For each device, checks if the local time is 10 AM.
 * If so, evaluates each meeting's reminder windows and sends notifications.
 */
exports.sendMeetingReminders = onSchedule(
  {
    schedule: '0 * * * *', // Every hour on the hour
    timeoutSeconds: 120,
  },
  async () => {
    const db = getFirestore();
    const messaging = getMessaging();

    const devicesSnapshot = await db.collection('devices').get();
    if (devicesSnapshot.empty) {
      console.log('[Reminders] No devices registered.');
      return;
    }

    const staleTokens = [];
    let sent = 0;

    for (const deviceDoc of devicesSnapshot.docs) {
      const data = deviceDoc.data();
      const { fcmToken, meetings, timezone } = data;

      if (!fcmToken || !meetings || !Array.isArray(meetings)) continue;
      if (!timezone) {
        // Skip devices without timezone — they'll get it on next app open
        continue;
      }

      // Only send at 10 AM local time
      let localHour;
      try {
        localHour = getLocalHour(timezone);
      } catch {
        console.warn(`[Reminders] Invalid timezone "${timezone}" for device ${deviceDoc.id}`);
        continue;
      }
      if (localHour !== 10) continue;

      const todayLocal = getLocalDate(timezone);

      // Check each meeting for reminder matches
      const reminders = [];
      for (const meeting of meetings) {
        if (!meeting.nextDate || !meeting.cadence) continue;

        // Use per-meeting override or cadence-based defaults
        const reminderDays = (meeting.reminderDays != null && Array.isArray(meeting.reminderDays))
          ? meeting.reminderDays
          : getDefaultReminderDays(meeting.cadence);

        for (const d of reminderDays) {
          const reminderDate = subtractDays(meeting.nextDate, d);
          if (reminderDate === todayLocal) {
            reminders.push({ meeting, daysUntil: d });
          }
        }
      }

      if (reminders.length === 0) continue;

      // Build notification
      let title, body;
      if (reminders.length === 1) {
        const r = reminders[0];
        title = `${r.meeting.name} ${daysLabel(r.daysUntil)}`;
        body = `Your ${r.meeting.name} is ${daysLabel(r.daysUntil)}.`;
      } else {
        // Group by time horizon
        const labels = reminders.map(r => `${r.meeting.name} (${daysLabel(r.daysUntil)})`);
        title = `${reminders.length} meeting reminders`;
        body = labels.join(', ');
      }

      // Build unique tag to prevent duplicate notifications
      const tag = reminders.length === 1
        ? `meeting-${reminders[0].meeting.id}-${reminders[0].meeting.nextDate}-${reminders[0].daysUntil}`
        : `meetings-${todayLocal}`;

      try {
        await messaging.send({
          token: fcmToken,
          notification: { title, body },
          data: {
            type: 'meeting_reminder',
            tag,
            meetingCount: String(reminders.length),
          },
          webpush: {
            fcmOptions: { link: '/' },
            notification: {
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag,
            },
          },
        });
        sent++;
        console.log(`[Reminders] Sent to device ${deviceDoc.id}: ${title}`);
      } catch (err) {
        if (
          err.code === 'messaging/registration-token-not-registered' ||
          err.code === 'messaging/invalid-registration-token'
        ) {
          staleTokens.push(deviceDoc.id);
        } else {
          console.error(`[Reminders] Error sending to ${deviceDoc.id}:`, err.message);
        }
      }
    }

    // Clean up stale tokens
    for (const id of staleTokens) {
      await db.collection('devices').doc(id).delete();
      console.log(`[Reminders] Removed stale device: ${id}`);
    }

    console.log(`[Reminders] Done. Sent ${sent} notifications, removed ${staleTokens.length} stale tokens.`);
  }
);
