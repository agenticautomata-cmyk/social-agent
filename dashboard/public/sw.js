self.addEventListener('push', (event) => {
  let payload = {
    title: 'Benson',
    body: '',
    url: '/home',
    celebration: null,
    milestone: null,
    followerCount: null,
  };
  try {
    payload = { ...payload, ...JSON.parse(event.data?.text() ?? '{}') };
  } catch {
    payload.body = event.data?.text() ?? '';
  }

  const isCelebration = payload.celebration === 'fireworks' || payload.milestone;

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.milestone || payload.topic || 'benson',
      requireInteraction: isCelebration,
      vibrate: isCelebration ? [200, 100, 200, 100, 400] : [120, 60, 120],
      data: {
        url: payload.url ?? '/home',
        celebration: payload.celebration,
        milestone: payload.milestone,
        followerCount: payload.followerCount,
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};
  let target = data.url ?? '/home';
  if (data.milestone === 'followers_10000' && !String(target).includes('celebrate=')) {
    target = '/home?celebrate=followers-10000';
  }
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client && typeof client.navigate === 'function') {
            return client.navigate(target).then(() => client.focus());
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(target);
      }
    }),
  );
});
