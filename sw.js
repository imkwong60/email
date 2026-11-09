const CACHE = 'emailbook-v5';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './kumamon-icon.jpg',
  // CDN 依賴（快速方案：離線至少有殼；字型 woff2 失敗時瀏覽器 fallback）
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+TC:wght@300;400;500;700&display=swap',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(async cache => {
        // 逐個加，單一失敗唔拖垮全部
        await Promise.all(
          PRECACHE.map(url =>
            cache.add(url).catch(err => console.warn('precache skip', url, err))
          )
        );
      })
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

// Navigation fallback + 安全 fetch（永不 respondWith(undefined)）
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 導航：優先網路，失敗回 index.html
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) return res;
          return caches.match('./index.html')
            .then(c => c || caches.match('/index.html') || res);
        })
        .catch(() =>
          caches.match('./index.html')
            .then(c => c || caches.match('/index.html') ||
              new Response('<!doctype html><title>離線</title><body style="font-family:sans-serif;padding:2rem;text-align:center"><h1>離線</h1><p>請連線後重試</p></body>', {
                status: 503,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              })
            )
        )
    );
    return;
  }

  // 其餘：cache-first，miss 再 network；兩者都失敗回 503（唔好 undefined）
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(res => {
          // 同源成功回應可寫入 cache（動態補強）
          if (res && res.ok && req.url.startsWith(self.location.origin)) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          new Response('', { status: 503, statusText: 'Offline' })
        );
    })
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

// 有現成 client：只 focus + postMessage
// 冇 client：openWindow 前確認 cache 有 index.html
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
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
          client.postMessage({ type: 'OPEN_EMAIL', emailId: data.emailId || null });
        } catch (_) {}
        return;
      }
    }

    if (!self.clients.openWindow) return;

    // 離線且 cache 冇殼 → 唔開空白／404 窗
    const cachedShell = (await caches.match('./index.html')) || (await caches.match('/index.html'));
    if (!cachedShell) {
      try {
        const probe = await fetch('./index.html', { method: 'HEAD', cache: 'no-store' });
        if (!probe.ok) return;
      } catch (_) {
        return;
      }
    }

    const abs = new URL(target, self.location.href).href;
    return self.clients.openWindow(abs);
  })());
});
