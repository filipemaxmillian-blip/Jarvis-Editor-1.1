// Notifications on the iPhone (Web Push). Works when the app is installed on the Home Screen (iOS 16.4+).
import webpush from "web-push";
import { db, settings } from "./db.js";
import { config } from "./config.js";
import { nowIso } from "./store.js";

// The key pair is created once and kept in the database, so there is nothing to configure.
let keys = settings.get("vapid_keys");
if (!keys) {
  keys = JSON.stringify(webpush.generateVAPIDKeys());
  settings.set("vapid_keys", keys);
}
keys = JSON.parse(keys);
webpush.setVapidDetails(config.publicUrl.startsWith("https://") ? config.publicUrl : "mailto:jarvis-social@example.com", keys.publicKey, keys.privateKey);

export const publicKey = keys.publicKey;

export function saveSubscription(sub) {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Inscrição inválida.");
  db.prepare(`INSERT INTO push_subscriptions (endpoint, data, created_at) VALUES (?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET data = excluded.data`).run(sub.endpoint, JSON.stringify(sub), nowIso());
}

export function removeSubscription(endpoint) {
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

export const subscriptionCount = () => db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get().n;

export async function notify(title, body, tab = "agenda") {
  const subs = db.prepare("SELECT data FROM push_subscriptions").all();
  const payload = JSON.stringify({ title, body, url: `/?aba=${tab}` });
  await Promise.all(subs.map(async ({ data }) => {
    const sub = JSON.parse(data);
    try {
      await webpush.sendNotification(sub, payload, { TTL: 24 * 3600 });
    } catch (err) {
      // 404/410: the phone removed the app or turned notifications off.
      if (err.statusCode === 404 || err.statusCode === 410) removeSubscription(sub.endpoint);
      else console.error("Notificação:", err.statusCode || err.message);
    }
  }));
}
