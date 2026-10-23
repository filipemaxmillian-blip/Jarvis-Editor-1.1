// Receives new comments from Meta (webhooks or the periodic sync) and runs the automations.
import { db, settings } from "./db.js";
import { config } from "./config.js";
import { findAccount, nowIso } from "./store.js";
import { isTokenError, replyToComment, sendPrivateReply } from "./meta.js";
import { validMetaSignature } from "./security.js";
import { notify } from "./push.js";

const PRIVATE_REPLY_WINDOW_MS = 7 * 86400e3;
const normalize = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function markNeedsReconnect(account, err) {
  if (!isTokenError(err)) return;
  const r = db.prepare("UPDATE accounts SET needs_reconnect = 1 WHERE id = ? AND needs_reconnect = 0").run(account.id);
  if (r.changes) notify("Conta desconectada", `${account.handle} precisa ser conectada de novo.`, "accounts").catch(() => {});
}

function postLabel(mediaId) {
  if (!mediaId) return null;
  const row = db.prepare(`
    SELECT p.caption FROM post_targets t JOIN posts p ON p.id = t.post_id
    WHERE t.remote_id = ? OR t.remote_id LIKE ?`).get(mediaId, `%_${mediaId}`);
  if (!row?.caption) return null;
  return row.caption.length > 40 ? row.caption.slice(0, 40).trimEnd() + "…" : row.caption;
}

// Returns true when an automation handled the comment.
export async function runAutomations(account, comment) {
  // Rules with a keyword win over catch-all rules, so "tutorial" isn't swallowed by a generic thank-you.
  const rules = db.prepare("SELECT * FROM rules WHERE enabled = 1 ORDER BY keyword = '', rowid").all();
  const rule = rules.find((r) =>
    JSON.parse(r.account_ids).includes(account.id) &&
    (!r.keyword || normalize(comment.text).includes(normalize(r.keyword)))
  );
  if (!rule) return false;

  if (rule.reply_text) {
    try {
      await replyToComment({ platform: account.platform, commentId: comment.id, token: account.token, text: rule.reply_text });
      db.prepare("UPDATE comments SET replied_text = ? WHERE id = ?").run(rule.reply_text, comment.id);
    } catch (err) {
      markNeedsReconnect(account, err);
      console.error(`Automação "${rule.name}": resposta falhou:`, err.message);
    }
  }
  if (rule.dm_text) {
    try {
      await sendPrivateReply({ pageId: account.page_id, commentId: comment.id, token: account.token, text: rule.dm_text });
      db.prepare("UPDATE comments SET dm_text = ? WHERE id = ?").run(rule.dm_text, comment.id);
    } catch (err) {
      markNeedsReconnect(account, err);
      console.error(`Automação "${rule.name}": mensagem privada falhou:`, err.message);
    }
  }
  db.prepare("UPDATE rules SET runs = runs + 1 WHERE id = ?").run(rule.id);
  return true;
}

export async function handleComment(account, { id, text, author, authorId, mediaId, createdAt = nowIso() }) {
  // Ignore our own replies, or every automated reply would trigger the automation again.
  if (!id || !text || authorId === account.external_id || authorId === account.page_id) return;
  const inserted = db.prepare(`
    INSERT OR IGNORE INTO comments (id, account_id, author, text, media_id, post_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, account.id, author, text, mediaId, postLabel(mediaId), createdAt);
  if (!inserted.changes) return;

  // Only comments made after the account was connected, and still inside Meta's 7-day window.
  // Without this, the first sync would message everyone who ever commented.
  // Meta timestamps are rounded to the second, hence the one-minute margin.
  const created = Date.parse(createdAt);
  if (created < Date.parse(account.created_at) - 60_000 || Date.now() - created > PRIVATE_REPLY_WINDOW_MS) return;

  const handled = await runAutomations(account, { id, text });
  if (!handled) notify(`Novo comentário em ${account.handle}`, `${author}: ${text}`.slice(0, 180), "inbox").catch(() => {});
}

async function processEvent(body) {
  settings.set("last_webhook_at", nowIso());
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      if (body.object === "instagram" && change.field === "comments") {
        const account = findAccount("instagram", entry.id);
        if (account) await handleComment(account, {
          id: v.id, text: v.text, author: v.from?.username ? `@${v.from.username}` : "Alguém",
          authorId: v.from?.id, mediaId: v.media?.id
        });
      }
      if (body.object === "page" && change.field === "feed" && v.item === "comment" && v.verb === "add") {
        const account = findAccount("facebook", entry.id);
        if (account) await handleComment(account, {
          id: v.comment_id, text: v.message, author: v.from?.name || "Alguém",
          authorId: v.from?.id, mediaId: v.post_id
        });
      }
    }
  }
}

export function mountWebhooks(app, express) {
  // Meta calls this once to confirm the URL when you set up webhooks in the developer dashboard.
  app.get("/webhooks/meta", (req, res) => {
    const ok = req.query["hub.mode"] === "subscribe" &&
      config.meta.webhookVerifyToken && req.query["hub.verify_token"] === config.meta.webhookVerifyToken;
    if (ok) {
      settings.set("webhook_verified_at", nowIso());
      res.send(req.query["hub.challenge"]);
    } else {
      res.sendStatus(403);
    }
  });

  app.post("/webhooks/meta", express.raw({ type: "application/json", limit: "1mb" }), (req, res) => {
    if (!validMetaSignature(req.body, req.get("x-hub-signature-256"))) return res.sendStatus(401);
    res.sendStatus(200); // Answer fast; Meta retries slow webhooks.
    let body;
    try { body = JSON.parse(req.body.toString("utf8")); } catch { return; }
    processEvent(body).catch((err) => console.error("Webhook:", err));
  });
}
