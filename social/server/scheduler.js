// Publishes posts when their time comes. Runs inside the server process.
import { db } from "./db.js";
import { config } from "./config.js";
import { accountWithToken, nowIso } from "./store.js";
import { publishFacebook, publishInstagram } from "./meta.js";

const TICK_MS = 30_000;
let running = false;

async function publishTarget(post, target) {
  const account = accountWithToken(target.account_id);
  const options = JSON.parse(post.options || "{}");
  const mediaUrl = post.media_file ? `${config.publicUrl}/media/${post.media_file}` : null;
  if (account.platform === "instagram") {
    return publishInstagram({
      igId: account.external_id, token: account.token, caption: post.caption,
      mediaUrl, mediaKind: post.media_kind, format: post.format, disableComments: options.noComments
    });
  }
  if (post.format === "story") throw new Error("Stories pela API só no Instagram.");
  return publishFacebook({ pageId: account.external_id, token: account.token, caption: post.caption, mediaUrl, mediaKind: post.media_kind });
}

export async function publishDuePosts() {
  if (running) return;
  running = true;
  try {
    const due = db.prepare("SELECT * FROM posts WHERE status = 'agendado' AND when_at <= ?").all(nowIso());
    for (const post of due) {
      db.prepare("UPDATE posts SET status = 'publicando' WHERE id = ?").run(post.id);
      const targets = db.prepare("SELECT * FROM post_targets WHERE post_id = ? AND status != 'publicado'").all(post.id);
      for (const t of targets) {
        try {
          const remoteId = await publishTarget(post, t);
          db.prepare("UPDATE post_targets SET status = 'publicado', remote_id = ?, error = NULL WHERE post_id = ? AND account_id = ?")
            .run(remoteId, post.id, t.account_id);
        } catch (err) {
          console.error(`Falha ao publicar ${post.id} em ${t.account_id}:`, err.message);
          db.prepare("UPDATE post_targets SET status = 'falhou', error = ? WHERE post_id = ? AND account_id = ?")
            .run(err.message, post.id, t.account_id);
        }
      }
      const results = db.prepare("SELECT status FROM post_targets WHERE post_id = ?").all(post.id).map((r) => r.status);
      const ok = results.filter((s) => s === "publicado").length;
      const status = ok === results.length ? "publicado" : ok === 0 ? "falhou" : "parcial";
      db.prepare("UPDATE posts SET status = ? WHERE id = ?").run(status, post.id);
    }
  } finally {
    running = false;
  }
}

export function startScheduler() {
  // A post left "publicando" by a restart goes back to the queue; targets already published are skipped.
  db.prepare("UPDATE posts SET status = 'agendado' WHERE status = 'publicando'").run();
  setInterval(() => publishDuePosts().catch((e) => console.error("Agendador:", e)), TICK_MS);
  publishDuePosts().catch((e) => console.error("Agendador:", e));
}
