import type { CaptionStyle, Segment, Word } from "./types";

// Whisper só devolve tempos por trecho; distribuímos o tempo entre as
// palavras proporcionalmente ao tamanho de cada uma.
export function segmentsToWords(segments: Segment[]): Word[] {
  const words: Word[] = [];
  for (const seg of segments) {
    const parts = seg.text.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const total = parts.reduce((sum, p) => sum + p.length + 1, 0);
    const span = Math.max(seg.end - seg.start, 0.1);
    let acc = 0;
    for (const text of parts) {
      const start = seg.start + (span * acc) / total;
      acc += text.length + 1;
      words.push({ text, start, end: seg.start + (span * acc) / total });
    }
  }
  return words;
}

export function groupWords(words: Word[], maxWords: number): Word[][] {
  const groups: Word[][] = [];
  let current: Word[] = [];
  words.forEach((word, i) => {
    current.push(word);
    const next = words[i + 1];
    if (
      current.length >= maxWords ||
      /[.,!?;:]$/.test(word.text) ||
      !next ||
      next.start - word.end > 0.6
    ) {
      groups.push(current);
      current = [];
    }
  });
  return groups;
}

function srtTime(seconds: number) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

export function toSrt(segments: Segment[]) {
  return segments
    .map(
      (seg, i) =>
        `${i + 1}\n${srtTime(seg.start)} --> ${srtTime(seg.end)}\n${seg.text.trim()}\n`
    )
    .join("\n");
}

const STYLE = {
  reels: { upper: true, weight: 800, scale: 1, color: "#ffffff", active: "#ffe14d", glow: "" },
  jarvis: { upper: true, weight: 700, scale: 0.9, color: "#e6f6ff", active: "#73d8ff", glow: "#73d8ff" },
  classico: { upper: false, weight: 600, scale: 0.62, color: "#ffffff", active: "#ffffff", glow: "" }
} as const;

function layoutLines(
  ctx: CanvasRenderingContext2D,
  words: string[],
  maxWidth: number
) {
  const space = ctx.measureText(" ").width;
  const lines: { words: string[]; width: number }[] = [];
  let line: string[] = [];
  let width = 0;
  for (const w of words) {
    const ww = ctx.measureText(w).width;
    const next = line.length ? width + space + ww : ww;
    if (line.length && next > maxWidth) {
      lines.push({ words: line, width });
      line = [w];
      width = ww;
    } else {
      line.push(w);
      width = next;
    }
  }
  if (line.length) lines.push({ words: line, width });
  return { lines, space };
}

export function drawCaptions(
  ctx: CanvasRenderingContext2D,
  groups: Word[][],
  t: number,
  styleId: CaptionStyle,
  w: number,
  h: number
) {
  const group = groups.find(
    (g) => g[0].start <= t && t < g[g.length - 1].end + 0.15
  );
  if (!group) return;

  const style = STYLE[styleId];
  const texts = group.map((wd) => (style.upper ? wd.text.toUpperCase() : wd.text));
  const maxWidth = w * 0.86;
  let size = Math.min(w, h) * 0.085 * style.scale;

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  let layout;
  for (;;) {
    ctx.font = `${style.weight} ${size}px Inter, "Segoe UI", sans-serif`;
    layout = layoutLines(ctx, texts, maxWidth);
    if (layout.lines.length <= 2 || size < 18) break;
    size *= 0.88;
  }

  const lineHeight = size * 1.2;
  const centerY = h * (h > w ? 0.72 : 0.8);
  const top = centerY - ((layout.lines.length - 1) * lineHeight) / 2;

  if (styleId === "classico") {
    const boxW = Math.max(...layout.lines.map((l) => l.width)) + size * 1.2;
    const boxH = layout.lines.length * lineHeight + size * 0.6;
    ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
    ctx.beginPath();
    ctx.roundRect(w / 2 - boxW / 2, top - lineHeight / 2 - size * 0.3, boxW, boxH, size * 0.3);
    ctx.fill();
  }

  let index = 0;
  layout.lines.forEach((line, li) => {
    let x = w / 2 - line.width / 2;
    const y = top + li * lineHeight;
    for (const text of line.words) {
      const word = group[index++];
      const ww = ctx.measureText(text).width;
      const active = styleId !== "classico" && t >= word.start && t < word.end;
      const pop = active ? 1 + 0.14 * Math.max(0, 1 - (t - word.start) / 0.12) : 1;

      ctx.save();
      ctx.translate(x + ww / 2, y);
      ctx.scale(pop, pop);
      if (styleId !== "classico") {
        ctx.lineWidth = size * 0.17;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.92)";
        ctx.strokeText(text, -ww / 2, 0);
      }
      if (style.glow && active) {
        ctx.shadowColor = style.glow;
        ctx.shadowBlur = size * 0.6;
      }
      ctx.fillStyle = active ? style.active : style.color;
      ctx.fillText(text, -ww / 2, 0);
      ctx.restore();

      x += ww + layout.space;
    }
  });
  ctx.restore();
}
