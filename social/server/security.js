// Session cookie, password check and encryption of stored access tokens.
import crypto from "node:crypto";
import { config } from "./config.js";

const key = crypto.createHash("sha256").update(config.secretKey).digest();
const SESSION_COOKIE = "js_session";
const SESSION_DAYS = 30;

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decrypt(b64) {
  const buf = Buffer.from(b64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

const sign = (value) => crypto.createHmac("sha256", key).update(value).digest("base64url");

const safeEqual = (a, b) => {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export const randomId = (bytes = 9) => crypto.randomBytes(bytes).toString("base64url");

export function readCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, maxAgeSeconds) {
  const secure = config.publicUrl.startsWith("https://") ? "; Secure" : "";
  res.append("Set-Cookie", `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

export function checkPassword(password) {
  return safeEqual(password || "", config.appPassword);
}

export function startSession(res) {
  const expires = String(Date.now() + SESSION_DAYS * 86400e3);
  setCookie(res, SESSION_COOKIE, `${expires}.${sign(expires)}`, SESSION_DAYS * 86400);
}

export function endSession(res) {
  setCookie(res, SESSION_COOKIE, "", 0);
}

export function requireAuth(req, res, next) {
  const [expires, mac] = (readCookies(req)[SESSION_COOKIE] || "").split(".");
  if (expires && mac && safeEqual(mac, sign(expires)) && Number(expires) > Date.now()) return next();
  res.status(401).json({ error: "Faça login para continuar." });
}

// Meta signs every webhook with the app secret (X-Hub-Signature-256).
export function validMetaSignature(rawBody, header) {
  if (!header || !config.meta.appSecret) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", config.meta.appSecret).update(rawBody).digest("hex");
  return safeEqual(header, expected);
}

export const oauthState = {
  create(res) {
    const state = randomId(16);
    setCookie(res, "js_oauth_state", state, 600);
    return state;
  },
  check(req, res, state) {
    const ok = Boolean(state) && safeEqual(state, readCookies(req).js_oauth_state || "");
    setCookie(res, "js_oauth_state", "", 0);
    return ok;
  }
};
