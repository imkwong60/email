// 電郵本本 Service Worker — Web Push
const APP_URL = self.registration.scope || "/";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "電郵本本", body: event.data ? event.data.text() : "您有新的郵件" };
  }

  const title = payload.title || "電郵本本";
  const options = {
    body: payload.body || "您有新的重要／交易郵件",
    icon: payload.icon || "./kumamon-icon.jpg",
    badge: payload.badge || "./kumamon-icon.jpg",
    tag: payload.tag || "emailbook",
    renotify: payload.renotify !== false,
    data: payload.data || {},
    vibrate: [100, 50, 100],
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const target = event.notification?.data?.url || APP_URL;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
    })
  );
});

self.addEventListener("notificationclose", event => {
  // 預留統計位置；目前不寫入任何資料。
});
