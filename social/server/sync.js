// Every few minutes, fetches recent comments from each account. Catches anything the webhooks missed.
import { db, settings } from "./db.js";
import { accountWithToken, nowIso } from "./store.js";
import { recentFacebookComments, recentInstagramComments } from "./meta.js";
import { handleComment, markNeedsReconnect } from "./webhooks.js";

const EVERY_MS = 3 * 60_000;
let running = false;

export async function syncComments() {
  if (running) return;
  running = true;
  try {
    const ids = db.prepare("SELECT id FROM accounts WHERE needs_reconnect = 0").all().map((r) => r.id);
    for (const id of ids) {
      const account = accountWithToken(id);
      try {
        const comments = account.platform === "instagram"
          ? await recentInstagramComments(account.external_id, account.token)
          : await recentFacebookComments(account.external_id, account.token);
        // Oldest first, so automations answer in the order people commented.
        comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        for (const c of comments) await handleComment(account, c);
      } catch (err) {
        markNeedsReconnect(account, err);
        console.error(`Sincronizar ${account.handle}:`, err.message);
      }
    }
    settings.set("last_sync_at", nowIso());
  } finally {
    running = false;
  }
}

export function startCommentSync() {
  setInterval(() => syncComments().catch((e) => console.error("Sincronização:", e)), EVERY_MS);
  setTimeout(() => syncComments().catch((e) => console.error("Sincronização:", e)), 10_000);
}
