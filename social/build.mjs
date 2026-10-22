// Wraps src/app.html in a full PWA document and copies public/ into dist/.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const app = readFileSync(new URL("./src/app.html", import.meta.url), "utf8");
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
console.log("dist/ pronto");
