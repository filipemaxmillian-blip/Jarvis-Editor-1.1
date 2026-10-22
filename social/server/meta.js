// Minimal client for the Meta Graph API (Facebook Pages + Instagram professional accounts).
import { config } from "./config.js";

const GRAPH = `https://graph.facebook.com/${config.meta.graphVersion}`;

export const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_engagement",
  "pages_manage_metadata",
  "pages_messaging",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_messages"
];

export class MetaError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function graph(method, path, params = {}, token) {
  const url = new URL(GRAPH + path);
  const all = { ...params };
  if (token) all.access_token = token;
  const encoded = Object.fromEntries(
    Object.entries(all)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)])
  );

  let body;
  if (method === "GET") {
    for (const [k, v] of Object.entries(encoded)) url.searchParams.set(k, v);
  } else {
    body = new URLSearchParams(encoded);
  }

  const res = await fetch(url, { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new MetaError(data.error?.error_user_msg || data.error?.message || `Erro ${res.status} da Meta`, data.error?.code);
  }
  return data;
}

/* ---------- Login ---------- */

export const redirectUri = () => `${config.publicUrl}/auth/meta/callback`;

export function loginUrl(state) {
  const url = new URL(`https://www.facebook.com/${config.meta.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.meta.appId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", SCOPES.join(","));
  return url.toString();
}

// Code -> short-lived user token -> long-lived user token.
// Page tokens fetched with a long-lived user token do not expire.
export async function exchangeCode(code) {
  const { appId, appSecret } = config.meta;
  const short = await graph("GET", "/oauth/access_token", {
    client_id: appId, client_secret: appSecret, redirect_uri: redirectUri(), code
  });
  const long = await graph("GET", "/oauth/access_token", {
    grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token
  });
  return long.access_token;
}

export async function listPages(userToken) {
  const pages = [];
  let next = await graph("GET", "/me/accounts", {
    fields: "id,name,access_token,followers_count,instagram_business_account{id,username,followers_count}",
    limit: 100
  }, userToken);
  for (;;) {
    pages.push(...next.data);
    if (!next.paging?.next) break;
    next = await (await fetch(next.paging.next)).json();
  }
  return pages;
}

// Makes the Page send comment events for itself and its linked Instagram account.
export function subscribePage(pageId, pageToken) {
  return graph("POST", `/${pageId}/subscribed_apps`, { subscribed_fields: "feed" }, pageToken);
}

/* ---------- Publishing ---------- */

export async function publishFacebook({ pageId, token, caption, mediaUrl, mediaKind }) {
  if (!mediaUrl) {
    const r = await graph("POST", `/${pageId}/feed`, { message: caption }, token);
    return r.id;
  }
  if (mediaKind === "image") {
    const r = await graph("POST", `/${pageId}/photos`, { url: mediaUrl, caption }, token);
    return r.post_id || r.id;
  }
  const r = await graph("POST", `/${pageId}/videos`, { file_url: mediaUrl, description: caption }, token);
  return r.id;
}

export async function publishInstagram({ igId, token, caption, mediaUrl, mediaKind, format, disableComments }) {
  if (!mediaUrl) throw new MetaError("O Instagram precisa de uma foto ou vídeo.");

  const params = {};
  if (format === "story") {
    params.media_type = "STORIES";
  } else {
    params.caption = caption;
    if (mediaKind === "video") params.media_type = "REELS";
  }
  if (mediaKind === "video") params.video_url = mediaUrl;
  else params.image_url = mediaUrl;

  const container = await graph("POST", `/${igId}/media`, params, token);

  // Instagram downloads and processes the file before it can be published (videos take a while).
  for (let i = 0; i < 60; i++) {
    const { status_code: status } = await graph("GET", `/${container.id}`, { fields: "status_code" }, token);
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") throw new MetaError("O Instagram não conseguiu processar a mídia.");
    if (i === 59) throw new MetaError("O Instagram demorou demais para processar a mídia.");
    await sleep(5000);
  }

  const published = await graph("POST", `/${igId}/media_publish`, { creation_id: container.id }, token);
  if (disableComments && format !== "story") {
    await graph("POST", `/${published.id}`, { comment_enabled: false }, token).catch(() => {});
  }
  return published.id;
}

/* ---------- Comments ---------- */

export function replyToComment({ platform, commentId, token, text }) {
  const edge = platform === "instagram" ? "replies" : "comments";
  return graph("POST", `/${commentId}/${edge}`, { message: text }, token);
}

// "Private reply": one direct message to the person who commented, within 7 days of the comment.
export function sendPrivateReply({ pageId, commentId, token, text }) {
  return graph("POST", `/${pageId}/messages`, {
    recipient: { comment_id: commentId },
    message: { text }
  }, token);
}
