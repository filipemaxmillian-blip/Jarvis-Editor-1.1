// Inlines src/app.js into src/app.html, wraps it in a full PWA document and copies public/ into dist/.
// Also writes dist/preview.html: the same app without the PWA wrapper, for the shareable preview.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const script = readFileSync(new URL("./src/app.js", import.meta.url), "utf8");
const app = readFileSync(new URL("./src/app.html", import.meta.url), "utf8").replace("/*SCRIPT*/", () => script);
const head = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d1015">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Jarvis Social">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
`;

const out = new URL("./dist/", import.meta.url);
mkdirSync(out, { recursive: true });
cpSync(new URL("./public/", import.meta.url), out, { recursive: true });
writeFileSync(new URL("index.html", out), head + app + "\n</html>\n");
writeFileSync(new URL("preview.html", out), app);

// Hashes of the inline scripts, so the server's Content-Security-Policy allows only them.
const scriptHashes = [...app.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(([, code]) => `'sha256-${createHash("sha256").update(code).digest("base64")}'`);
writeFileSync(new URL("csp.json", out), JSON.stringify({ scriptHashes }));
console.log("dist/ pronto");
