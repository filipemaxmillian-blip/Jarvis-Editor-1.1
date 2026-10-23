import { drawCaptions } from "./captions";
import type { EffectId, RenderSettings } from "./types";

const FILTERS: Partial<Record<EffectId, string>> = {
  cinema: "contrast(1.12) saturate(1.2) brightness(0.95)",
  pb: "grayscale(1) contrast(1.2)",
  vintage: "sepia(0.5) saturate(0.85) contrast(1.05) brightness(1.05)",
  neon: "saturate(1.7) contrast(1.15) brightness(1.05)",
  glitch: "contrast(1.1) saturate(1.3)"
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

function rand(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  w: number,
  h: number,
  zoom: number
) {
  const scale = Math.max(w / video.videoWidth, h / video.videoHeight) * zoom;
  const dw = video.videoWidth * scale;
  const dh = video.videoHeight * scale;
  ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function glitch(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
  const seed = Math.floor(now / 90);
  if (rand(seed) < 0.55) return;
  const canvas = ctx.canvas;
  const bands = 3 + Math.floor(rand(seed + 1) * 5);
  for (let i = 0; i < bands; i++) {
    const y = rand(seed + i * 7) * h;
    const bh = (0.01 + rand(seed + i * 3) * 0.06) * h;
    const dx = (rand(seed + i * 5) - 0.5) * w * 0.12;
    ctx.drawImage(canvas, 0, y, w, bh, dx, y, w, bh);
  }
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.globalCompositeOperation = "screen";
  ctx.filter = "hue-rotate(180deg)";
  ctx.drawImage(canvas, (rand(seed + 9) - 0.5) * w * 0.03, 0);
  ctx.restore();
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  s: RenderSettings,
  t: number,
  now: number
) {
  const { width: w, height: h } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  if (video.readyState < 2 || !video.videoWidth) {
    ctx.restore();
    return;
  }

  const span = Math.max(s.trimOut - s.trimIn, 0.001);
  const local = t - s.trimIn;
  const progress = clamp(local / span, 0, 1);

  let zoom = 1;
  if (s.effect === "zoom") zoom *= 1 + 0.18 * progress;
  if (s.intro === "zoom" && local < 0.8) zoom *= 1 + 0.35 * (1 - easeOut(clamp(local / 0.8, 0, 1)));

  ctx.filter = FILTERS[s.effect] ?? "none";
  drawCover(ctx, video, w, h, zoom);
  ctx.filter = "none";

  switch (s.effect) {
    case "glitch":
      glitch(ctx, w, h, now);
      break;
    case "neon": {
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "rgba(115,216,255,0.55)");
      g.addColorStop(1, "rgba(100,133,255,0.55)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      ctx.fillStyle = "rgba(115,216,255,0.05)";
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
      vignette(ctx, w, h, 0.45);
      break;
    }
    case "vintage":
      vignette(ctx, w, h, 0.6);
      break;
    case "cinema": {
      const bar = h * (h > w ? 0.05 : 0.09);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
      break;
    }
  }

  if (s.captionsOn && s.groups.length) {
    drawCaptions(ctx, s.groups, t, s.captionStyle, w, h);
  }

  if (s.intro === "fade" && local < 0.6) {
    ctx.fillStyle = `rgba(0,0,0,${1 - clamp(local / 0.6, 0, 1)})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (s.intro === "flash" && local < 0.35) {
    ctx.fillStyle = `rgba(255,255,255,${1 - clamp(local / 0.35, 0, 1)})`;
    ctx.fillRect(0, 0, w, h);
  }
  const remaining = s.trimOut - t;
  if (s.outro === "fade" && remaining < 0.6) {
    ctx.fillStyle = `rgba(0,0,0,${1 - clamp(remaining / 0.6, 0, 1)})`;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.restore();
}
