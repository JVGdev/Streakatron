// Streakatron's service worker (D38): makes the app installable and shows Web Push notifications
// (reminders, focus ended, the streak nudge), with their buttons (Done, +1, Snooze 1 h) working
// without opening the app. It caches nothing: there is no offline data.
//
// The server's message is `PushMessage` in apps/server/src/services/push.ts.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const windows = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true });

/** Tell every open window (the app refreshes what changed, or shows a toast). */
async function broadcast(data) {
  for (const w of await windows()) w.postMessage(data);
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let message;
      try {
        message = event.data.json();
      } catch {
        message = {
          title: 'Streakatron',
          body: event.data?.text() ?? '',
          tag: 'message',
          url: '/',
        };
      }
      // The app is in front: it shows a toast instead of a notification.
      const front = (await windows()).find((w) => w.focused && w.visibilityState === 'visible');
      if (front) {
        front.postMessage({ type: 'push', message });
        return;
      }
      await self.registration.showNotification(message.title, {
        body: message.body,
        tag: message.tag,
        renotify: true,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        data: { url: message.url, target: message.target ?? null },
        actions: message.actions ?? [],
      });
    })(),
  );
});

/** A notification button, sent as the signed-in browser. True when it worked. */
async function act(action, target) {
  let path;
  let body = {};
  if (action === 'snooze') {
    path = '/api/reminders/snooze';
    body = { id: target.id };
  } else if (target.kind === 'task' && action === 'done') {
    path = `/api/tasks/${target.id}/complete`;
  } else if (target.kind === 'commitment' && (action === 'done' || action === 'plus1')) {
    path = `/api/commitments/${target.id}/entries`;
    body = { amount: 1 };
  } else {
    return false;
  }
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function open(url) {
  const [w] = await windows();
  if (w) {
    await w.focus();
    w.postMessage({ type: 'navigate', url });
    return;
  }
  await self.clients.openWindow(url);
}

self.addEventListener('notificationclick', (event) => {
  const { url = '/today', target = null } = event.notification.data ?? {};
  event.notification.close();
  event.waitUntil(
    (async () => {
      if (event.action && target) {
        if (await act(event.action, target)) {
          await broadcast({ type: 'changed' });
          return;
        }
      }
      // A plain click, or a button that didn't work (signed out, offline): open the app there.
      await open(url);
    })(),
  );
});

// The browser replaced the subscription: send the new one, so reminders keep arriving.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const options = event.oldSubscription?.options;
      if (!options) return;
      const sub = await self.registration.pushManager.subscribe(options);
      await fetch('/api/push/devices', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
    })(),
  );
});
