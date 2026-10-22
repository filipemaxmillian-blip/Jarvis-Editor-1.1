// Receives new comments from Meta and runs the automations.
import { db } from "./db.js";
import { config } from "./config.js";
import { findAccount, nowIso } from "./store.js";
import { replyToComment, sendPrivateReply } from "./meta.js";
import { validMetaSignature } from "./security.js";

const normalize = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function postLabel(mediaId) {
  if (!mediaId) return null;
  const row = db.prepare(`
    SELECT p.caption FROM post_targets t JOIN posts p ON p.id = t.post_id
    WHERE t.remote_id = ? OR t.remote_id LIKE ?`).get(mediaId, `%_${mediaId}`);
  if (!row?.caption) return null;
  return row.caption.length > 40 ? row.caption.slice(0, 40).trimEnd() + "…" : row.caption;
}

export async function runAutomations(account, comment) {
  // Rules with a keyword win over catch-all rules, so "tutorial" isn't swallowed by a generic thank-you.
  const rules = db.prepare("SELECT * FROM rules WHERE enabled = 1 ORDER BY keyword = '', rowid").all();
  const rule = rules.find((r) =>
    JSON.parse(r.account_ids).includes(account.id) &&
    (!r.keyword || normalize(comment.text).includes(normalize(r.keyword)))
  );
  if (!rule) return;

  if (rule.reply_text) {
    try {
      await replyToComment({ platform: account.platform, commentId: comment.id, token: account.token, text: rule.reply_text });
      db.prepare("UPDATE comments SET replied_text = ? WHERE id = ?").run(rule.reply_text, comment.id);
    } catch (err) {
      console.error(`Automação "${rule.name}": resposta falhou:`, err.message);
    }
  }
  if (rule.dm_text) {
    try {
      await sendPrivateReply({ pageId: account.page_id, commentId: comment.id, token: account.token, text: rule.dm_text });
      db.prepare("UPDATE comments SET dm_text = ? WHERE id = ?").run(rule.dm_text, comment.id);
    } catch (err) {
      console.error(`Automação "${rule.name}": mensagem privada falhou:`, err.message);
    }
  }
  db.prepare("UPDATE rules SET runs = runs + 1 WHERE id = ?").run(rule.id);
}

async function handleComment(account, { id, text, author, authorId, mediaId }) {
  // Ignore our own replies, or every automated reply would trigger the automation again.
  if (!id || !text || authorId === account.external_id || authorId === account.page_id) return;
  const inserted = db.prepare(`
    INSERT OR IGNORE INTO comments (id, account_id, author, text, media_id, post_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, account.id, author, text, mediaId, postLabel(mediaId), nowIso());
  if (inserted.changes) await runAutomations(account, { id, text });
}

async function processEvent(body) {
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
    if (ok) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
  });

  app.post("/webhooks/meta", express.raw({ type: "application/json", limit: "1mb" }), (req, res) => {
    if (!validMetaSignature(req.body, req.get("x-hub-signature-256"))) return res.sendStatus(401);
    res.sendStatus(200); // Answer fast; Meta retries slow webhooks.
    let body;
    try { body = JSON.parse(req.body.toString("utf8")); } catch { return; }
    processEvent(body).catch((err) => console.error("Webhook:", err));
  });
}
