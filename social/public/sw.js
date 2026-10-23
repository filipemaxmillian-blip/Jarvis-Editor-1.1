// Keeps the app shell available offline. Bump CACHE when shipping a new version.
const CACHE = "jarvis-social-v3";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, cache as fallback, so updates show up as soon as you're online.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Only the app itself is cached; account data, login and media always come from the server.
  if (e.request.method !== "GET" || url.origin !== location.origin || /^\/(api|auth|media|webhooks)\//.test(url.pathname)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});

// Notifications sent by the server (reminders, failed posts, new comments).
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data.json(); } catch { data = { title: "Jarvis Social", body: e.data?.text() || "" }; }
  e.waitUntil(self.registration.showNotification(data.title || "Jarvis Social", {
    body: data.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: data.url || "./" }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if ("focus" in w) { await w.navigate(url).catch(() => {}); return w.focus(); }
    }
    return clients.openWindow(url);
  })());
});
