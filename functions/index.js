/**
 * Cloud Functions for Organize Yourselves
 *
 * sendDailyMeetingReminders — Runs daily at 7 PM (user's timezone).
 * Checks each device's meeting schedule and sends push notifications
 * for meetings happening tomorrow.
 *
 * Firestore schema (written by the client app):
 *   /devices/{deviceId}
 *     - fcmToken: string
 *     - meetings: Array<{ id, name, cadence, nextDate }>
 *     - updatedAt: timestamp
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

/**
 * Runs daily at 7:00 PM UTC (adjust timezone in firebase.json or here).
 * Sends push notifications for meetings happening tomorrow.
 */
exports.sendDailyMeetingReminders = onSchedule(
  {
    schedule: '0 19 * * *', // 7 PM UTC daily — adjust for your timezone
    timeoutSeconds: 120,
  },
  async () => {
    const db = getFirestore();
    const messaging = getMessaging();

    // Calculate tomorrow's date string (YYYY-MM-DD)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    console.log(`[Reminders] Checking for meetings on ${tomorrowStr}`);

    // Get all devices
    const devicesSnapshot = await db.collection('devices').get();
    if (devicesSnapshot.empty) {
      console.log('[Reminders] No devices registered.');
      return;
    }

    const staleTokens = [];
    let sent = 0;

    for (const deviceDoc of devicesSnapshot.docs) {
      const data = deviceDoc.data();
      const { fcmToken, meetings } = data;

      if (!fcmToken || !meetings || !Array.isArray(meetings)) continue;

      // Find meetings scheduled for tomorrow
      const tomorrowMeetings = meetings.filter(m => m.nextDate === tomorrowStr);
      if (tomorrowMeetings.length === 0) continue;

      // Build notification
      const meetingNames = tomorrowMeetings.map(m => m.name);
      const title = tomorrowMeetings.length === 1
        ? `${meetingNames[0]} tomorrow`
        : `${tomorrowMeetings.length} meetings tomorrow`;
      const body = tomorrowMeetings.length === 1
        ? `Your ${meetingNames[0]} is scheduled for tomorrow.`
        : `Meetings: ${meetingNames.join(', ')}`;

      try {
        await messaging.send({
          token: fcmToken,
          notification: { title, body },
          data: {
            type: 'meeting_reminder',
            tag: 'meeting-reminder',
            meetingCount: String(tomorrowMeetings.length),
          },
          webpush: {
            fcmOptions: { link: '/' },
            notification: {
              icon: '/icon-192.png',
              badge: '/icon-192.png',
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
