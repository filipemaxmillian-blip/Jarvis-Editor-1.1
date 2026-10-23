// Reads settings from environment variables. See .env.example.
import { resolve } from "node:path";

const env = process.env;

export const config = {
  port: Number(env.PORT) || 3000,
  publicUrl: (env.PUBLIC_URL || `http://localhost:${Number(env.PORT) || 3000}`).replace(/\/$/, ""),
  appPassword: env.APP_PASSWORD || "",
  secretKey: env.SECRET_KEY || "",
  dataDir: resolve(env.DATA_DIR || "./data"),
  meta: {
    appId: env.META_APP_ID || "",
    appSecret: env.META_APP_SECRET || "",
    graphVersion: env.META_GRAPH_VERSION || "v23.0",
    webhookVerifyToken: env.META_WEBHOOK_VERIFY_TOKEN || ""
  }
};

config.meta.configured = Boolean(config.meta.appId && config.meta.appSecret);

const missing = [];
if (config.appPassword.length < 12 || config.appPassword === "troque-esta-senha") missing.push("APP_PASSWORD (mínimo 12 caracteres, diferente do exemplo)");
if (config.secretKey.length < 32) missing.push("SECRET_KEY (mínimo 32 caracteres)");
if (missing.length) {
  console.error(`Configuração faltando: ${missing.join(", ")}. Copie .env.example para .env e preencha.`);
  process.exit(1);
}
