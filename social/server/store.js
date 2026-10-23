// Read/write helpers shared by the routes, the scheduler and the webhooks.
import { db } from "./db.js";
import { decrypt } from "./security.js";

export const nowIso = () => new Date().toISOString();

export function accountWithToken(id) {
  const a = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
  return a && { ...a, token: decrypt(a.token_enc) };
}

export function findAccount(platform, externalId) {
  const a = db.prepare("SELECT id FROM accounts WHERE platform = ? AND external_id = ?").get(platform, externalId);
  return a && accountWithToken(a.id);
}

const parseJson = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

// Everything the app needs to draw its screens, without tokens.
export function appState() {
  const accounts = db.prepare("SELECT id, platform, handle, followers, needs_reconnect FROM accounts ORDER BY platform, handle").all()
    .map(({ needs_reconnect, ...a }) => ({ ...a, needsReconnect: Boolean(needs_reconnect) }));
  const targets = db.prepare("SELECT post_id, account_id, status, error FROM post_targets").all();
  const posts = db.prepare("SELECT * FROM posts ORDER BY when_at").all().map((p) => {
    const mine = targets.filter((t) => t.post_id === p.id);
    return {
      id: p.id,
      caption: p.caption,
      format: p.format,
      media: p.media_kind === "video" ? "VÍDEO" : p.media_kind === "image" ? "FOTO" : "TEXTO",
      thumb: p.thumb,
      when: p.when_at,
      status: p.status,
      options: parseJson(p.options, {}),
      accountIds: mine.map((t) => t.account_id),
      errors: mine.filter((t) => t.error).map((t) => ({ accountId: t.account_id, error: t.error }))
    };
  });
  const comments = db.prepare("SELECT * FROM comments ORDER BY created_at DESC LIMIT 200").all().map((c) => ({
    id: c.id,
    accountId: c.account_id,
    author: c.author,
    text: c.text,
    post: c.post_label || "um post",
    when: Date.parse(c.created_at),
    replied: c.replied_text,
    dmSent: c.dm_text
  }));
  const rules = db.prepare("SELECT * FROM rules ORDER BY rowid").all().map((r) => ({
    id: r.id,
    name: r.name,
    enabled: Boolean(r.enabled),
    keyword: r.keyword,
    replyText: r.reply_text,
    dmText: r.dm_text,
    accountIds: parseJson(r.account_ids, []),
    runs: r.runs
  }));
  return { accounts, posts, comments, rules };
}
