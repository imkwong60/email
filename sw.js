const CACHE = 'emailbook-v3';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './kumamon-icon.jpg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Navigation fallback：避免通知打開 /?email= 或未知路徑時出現 404
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 只處理同源 navigation / document 請求
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) return res;
          return caches.match('./index.html').then(c => c || caches.match('/index.html') || res);
        })
        .catch(() =>
          caches.match('./index.html')
            .then(c => c || caches.match('/index.html') || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  // 其餘：cache-first for precached assets，其餘走 network
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).catch(() => cached))
  );
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || '電郵本本';
  const options = {
    body: data.body || '您有新的郵件',
    icon: data.icon || './kumamon-icon.jpg',
    badge: data.badge || './kumamon-icon.jpg',
    tag: data.tag || (data.url || 'emailbook'),
    renotify: false,
    data: {
      url: data.url || './index.html',
      emailId: data.emailId || null,
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  // 一律相對路徑，避免跑到錯誤根目錄造成 404
  let target = data.url || './index.html';
  if (target.startsWith('/?') || target === '/') {
    target = './index.html' + (target.includes('?') ? target.slice(1) : '');
  }

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        await client.focus();
        try {
          client.postMessage({
            type: 'OPEN_EMAIL',
            emailId: data.emailId || null,
            url: target,
          });
        } catch (_) {}
        // 若支援 navigate，再嘗試（失敗不影響 focus）
        try {
          if (typeof client.navigate === 'function') {
            const abs = new URL(target, self.location.href).href;
            await client.navigate(abs);
          }
        } catch (_) {}
        return;
      }
    }
    if (self.clients.openWindow) {
      const abs = new URL(target, self.location.href).href;
      return self.clients.openWindow(abs);
    }
  })());
});
