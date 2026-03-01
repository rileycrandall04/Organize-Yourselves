/**
 * Firebase Cloud Messaging Service Worker
 *
 * Handles push notifications when the app is in the background.
 * Uses raw push event handler — no Firebase SDK needed in the SW.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Not JSON, show raw text
    payload = { notification: { title: 'Reminder', body: event.data.text() } };
  }

  const notification = payload.notification || {};
  const data = payload.data || {};

  const title = notification.title || data.title || 'Meeting Reminder';
  const options = {
    body: notification.body || data.body || 'You have an upcoming meeting',
    icon: notification.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'meeting-reminder',
    data: data,
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if available
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return clients.openWindow('/');
    })
  );
});
