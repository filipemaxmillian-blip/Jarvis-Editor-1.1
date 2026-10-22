// Jarvis Social server: serves the app, the API, Meta login and webhooks, and runs the scheduler.
import express from "express";
import { createWriteStream, mkdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { db } from "./db.js";
import { accountWithToken, appState, nowIso } from "./store.js";
import { publishDuePosts, startScheduler } from "./scheduler.js";
import { mountWebhooks } from "./webhooks.js";
import { replyToComment, sendPrivateReply, exchangeCode, listPages, loginUrl, subscribePage } from "./meta.js";
import { checkPassword, encrypt, endSession, oauthState, randomId, requireAuth, startSession } from "./security.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mediaDir = join(config.dataDir, "media");
mkdirSync(mediaDir, { recursive: true });

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

mountWebhooks(app, express);

// Meta downloads media from here when publishing, so this folder is public. File names are random.
app.use("/media", express.static(mediaDir, { maxAge: "7d", fallthrough: false }));

/* ---------- Session ---------- */

const json = express.json({ limit: "1mb" });
const attempts = new Map();

app.post("/api/login", json, (req, res) => {
  const ip = req.ip;
  const recent = (attempts.get(ip) || []).filter((t) => t > Date.now() - 15 * 60e3);
  if (recent.length >= 10) return res.status(429).json({ error: "Muitas tentativas. Espere 15 minutos." });
  if (!checkPassword(req.body?.password)) {
    attempts.set(ip, [...recent, Date.now()]);
    return res.status(401).json({ error: "Senha incorreta." });
  }
  attempts.delete(ip);
  startSession(res);
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => { endSession(res); res.json({ ok: true }); });

const api = express.Router();
api.use(requireAuth, json);

const fail = (res, status, error) => res.status(status).json({ error });

api.get("/state", (req, res) => res.json({ ...appState(), metaConfigured: config.meta.configured }));

/* ---------- Media ---------- */

const EXT = { "image/jpeg": "jpg", "image/png": "png", "video/mp4": "mp4", "video/quicktime": "mov" };

api.post("/media", async (req, res) => {
  const ext = EXT[req.get("content-type")];
  if (!ext) return fail(res, 415, "Use foto JPG/PNG ou vídeo MP4/MOV.");
  const name = `${randomId(16)}.${ext}`;
  try {
    await pipeline(req, createWriteStream(join(mediaDir, name)));
    res.json({ file: name, kind: ext === "mp4" || ext === "mov" ? "video" : "image" });
  } catch {
    fail(res, 500, "Não foi possível salvar o arquivo. Tente de novo.");
  }
});

/* ---------- Posts ---------- */

api.post("/posts", (req, res) => {
  const { caption = "", accountIds = [], when, format = "feed", media, options = {} } = req.body;
  const accounts = accountIds.map((id) => db.prepare("SELECT id, platform FROM accounts WHERE id = ?").get(id)).filter(Boolean);
  if (!accounts.length) return fail(res, 400, "Escolha pelo menos uma conta.");
  if (!caption.trim() && !media) return fail(res, 400, "Adicione uma mídia ou uma legenda.");
  if (!media && accounts.some((a) => a.platform === "instagram")) return fail(res, 400, "O Instagram precisa de uma foto ou vídeo.");
  if (format === "story" && accounts.some((a) => a.platform === "facebook")) return fail(res, 400, "Stories só podem ser agendados no Instagram.");
  const whenAt = when ? new Date(when) : new Date();
  if (Number.isNaN(whenAt.getTime())) return fail(res, 400, "Horário inválido.");
  if (media && !/^[\w-]+\.(jpg|png|mp4|mov)$/.test(media.file)) return fail(res, 400, "Mídia inválida.");

  const id = randomId();
  db.prepare(`INSERT INTO posts (id, caption, format, media_file, media_kind, thumb, when_at, status, options, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'agendado', ?, ?)`)
    .run(id, caption.trim(), format, media?.file ?? null, media?.kind ?? null,
      typeof req.body.thumb === "string" && req.body.thumb.length < 200_000 ? req.body.thumb : null,
      whenAt.toISOString(), JSON.stringify({ noComments: !!options.noComments, hideLikes: !!options.hideLikes, poll: !!options.poll }), nowIso());
  for (const a of accounts) db.prepare("INSERT INTO post_targets (post_id, account_id) VALUES (?, ?)").run(id, a.id);

  if (!when) publishDuePosts().catch(() => {});
  res.json({ id });
});

api.post("/posts/:id/publish-now", (req, res) => {
  const r = db.prepare("UPDATE posts SET when_at = ? WHERE id = ? AND status = 'agendado'").run(nowIso(), req.params.id);
  if (!r.changes) return fail(res, 404, "Este post não está mais na fila.");
  publishDuePosts().catch(() => {});
  res.json({ ok: true });
});

api.post("/posts/:id/retry", (req, res) => {
  const r = db.prepare("UPDATE posts SET status = 'agendado', when_at = ? WHERE id = ? AND status IN ('falhou', 'parcial')").run(nowIso(), req.params.id);
  if (!r.changes) return fail(res, 404, "Não há o que tentar de novo neste post.");
  db.prepare("UPDATE post_targets SET status = 'pendente', error = NULL WHERE post_id = ? AND status = 'falhou'").run(req.params.id);
  publishDuePosts().catch(() => {});
  res.json({ ok: true });
});

api.delete("/posts/:id", (req, res) => {
  const post = db.prepare("SELECT media_file FROM posts WHERE id = ? AND status != 'publicando'").get(req.params.id);
  if (!post) return fail(res, 409, "Este post está sendo publicado agora.");
  db.prepare("DELETE FROM posts WHERE id = ?").run(req.params.id);
  if (post.media_file) { try { unlinkSync(join(mediaDir, post.media_file)); } catch {} }
  res.json({ ok: true });
});

/* ---------- Comments ---------- */

function commentAndAccount(id) {
  const c = db.prepare("SELECT * FROM comments WHERE id = ?").get(id);
  return c && { comment: c, account: accountWithToken(c.account_id) };
}

api.post("/comments/:id/reply", async (req, res) => {
  const text = String(req.body.text || "").trim();
  const found = commentAndAccount(req.params.id);
  if (!found) return fail(res, 404, "Comentário não encontrado.");
  if (!text) return fail(res, 400, "Escreva a resposta.");
  try {
    await replyToComment({ platform: found.account.platform, commentId: found.comment.id, token: found.account.token, text });
    db.prepare("UPDATE comments SET replied_text = ? WHERE id = ?").run(text, found.comment.id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, 502, err.message);
  }
});

api.post("/comments/:id/dm", async (req, res) => {
  const text = String(req.body.text || "").trim();
  const found = commentAndAccount(req.params.id);
  if (!found) return fail(res, 404, "Comentário não encontrado.");
  if (found.comment.dm_text) return fail(res, 409, "Já foi enviada uma mensagem para este comentário.");
  if (!text) return fail(res, 400, "Escreva a mensagem.");
  try {
    await sendPrivateReply({ pageId: found.account.page_id, commentId: found.comment.id, token: found.account.token, text });
    db.prepare("UPDATE comments SET dm_text = ? WHERE id = ?").run(text, found.comment.id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, 502, err.message);
  }
});

/* ---------- Automations ---------- */

function saveRule(id, body, res) {
  const name = String(body.name || "").trim();
  const accountIds = (body.accountIds || []).filter((a) => db.prepare("SELECT 1 FROM accounts WHERE id = ?").get(a));
  const replyText = String(body.replyText || "").trim();
  const dmText = String(body.dmText || "").trim();
  if (!name) return fail(res, 400, "Dê um nome à automação.");
  if (!accountIds.length) return fail(res, 400, "Escolha pelo menos uma conta.");
  if (!replyText && !dmText) return fail(res, 400, "Escreva uma resposta ou uma mensagem.");
  db.prepare(`INSERT INTO rules (id, name, enabled, keyword, reply_text, dm_text, account_ids) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, keyword = excluded.keyword, reply_text = excluded.reply_text,
      dm_text = excluded.dm_text, account_ids = excluded.account_ids`)
    .run(id, name, body.enabled === false ? 0 : 1, String(body.keyword || "").trim(), replyText, dmText, JSON.stringify(accountIds));
  res.json({ id });
}

api.post("/rules", (req, res) => saveRule(randomId(), req.body, res));
api.put("/rules/:id", (req, res) => saveRule(req.params.id, req.body, res));
api.post("/rules/:id/toggle", (req, res) => {
  db.prepare("UPDATE rules SET enabled = 1 - enabled WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});
api.delete("/rules/:id", (req, res) => {
  db.prepare("DELETE FROM rules WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Accounts ---------- */

api.delete("/accounts/:id", (req, res) => {
  db.prepare("DELETE FROM accounts WHERE id = ?").run(req.params.id);
  db.prepare("DELETE FROM posts WHERE id NOT IN (SELECT post_id FROM post_targets)").run();
  res.json({ ok: true });
});

app.use("/api", api);

/* ---------- Meta login ---------- */

app.get("/auth/meta/start", requireAuth, (req, res) => {
  if (!config.meta.configured) return res.redirect("/?erro=" + encodeURIComponent("Configure META_APP_ID e META_APP_SECRET no servidor."));
  res.redirect(loginUrl(oauthState.create(res)));
});

app.get("/auth/meta/callback", requireAuth, async (req, res) => {
  const back = (params) => res.redirect("/?" + new URLSearchParams(params));
  if (!oauthState.check(req, res, req.query.state)) return back({ erro: "O login expirou. Tente conectar de novo." });
  if (req.query.error) return back({ erro: "Conexão cancelada." });
  try {
    const userToken = await exchangeCode(req.query.code);
    const pages = await listPages(userToken);
    let count = 0;
    const upsert = db.prepare(`INSERT INTO accounts (id, platform, external_id, page_id, handle, followers, token_enc, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(platform, external_id) DO UPDATE SET handle = excluded.handle, followers = excluded.followers,
        token_enc = excluded.token_enc, page_id = excluded.page_id`);
    for (const page of pages) {
      const token = encrypt(page.access_token);
      upsert.run(randomId(), "facebook", page.id, page.id, page.name, page.followers_count || 0, token, nowIso());
      count++;
      const ig = page.instagram_business_account;
      if (ig) {
        upsert.run(randomId(), "instagram", ig.id, page.id, `@${ig.username}`, ig.followers_count || 0, token, nowIso());
        count++;
      }
      await subscribePage(page.id, page.access_token).catch((err) => console.error(`Webhook da página ${page.name}:`, err.message));
    }
    back({ conectadas: count });
  } catch (err) {
    console.error("Login Meta:", err);
    back({ erro: err.message });
  }
});

/* ---------- App ---------- */

app.use(express.static(join(root, "dist"), { index: "index.html" }));

app.listen(config.port, () => {
  console.log(`Jarvis Social rodando em ${config.publicUrl}`);
  if (!config.meta.configured) console.log("Aviso: META_APP_ID/META_APP_SECRET não configurados. Conectar contas não vai funcionar.");
  startScheduler();
});
