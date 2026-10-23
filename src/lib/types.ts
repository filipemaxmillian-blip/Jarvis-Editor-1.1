export type Format = "16:9" | "9:16" | "1:1";

export type EffectId =
  | "none"
  | "cinema"
  | "pb"
  | "vintage"
  | "neon"
  | "glitch"
  | "zoom";

export type IntroId = "none" | "fade" | "zoom" | "flash";
export type OutroId = "none" | "fade";
export type CaptionStyle = "reels" | "jarvis" | "classico";

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface RenderSettings {
  format: Format;
  effect: EffectId;
  intro: IntroId;
  outro: OutroId;
  captionStyle: CaptionStyle;
  captionsOn: boolean;
  groups: Word[][];
  trimIn: number;
  trimOut: number;
}

export const FORMAT_SIZE: Record<Format, [number, number]> = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "1:1": [1080, 1080]
};

export const EFFECTS: { id: EffectId; label: string; hint: string }[] = [
  { id: "none", label: "Original", hint: "Sem filtro" },
  { id: "cinema", label: "Cinema", hint: "Contraste e faixas pretas" },
  { id: "pb", label: "Preto e branco", hint: "Clássico monocromático" },
  { id: "vintage", label: "Vintage", hint: "Tons quentes e vinheta" },
  { id: "neon", label: "Neon Jarvis", hint: "Brilho holográfico" },
  { id: "glitch", label: "Glitch", hint: "Falhas digitais" },
  { id: "zoom", label: "Zoom lento", hint: "Aproximação contínua" }
];

export const INTROS: { id: IntroId; label: string }[] = [
  { id: "none", label: "Nenhuma" },
  { id: "fade", label: "Fade" },
  { id: "zoom", label: "Zoom" },
  { id: "flash", label: "Flash" }
];

export const OUTROS: { id: OutroId; label: string }[] = [
  { id: "none", label: "Nenhuma" },
  { id: "fade", label: "Fade" }
];

export const CAPTION_STYLES: { id: CaptionStyle; label: string }[] = [
  { id: "reels", label: "Reels" },
  { id: "jarvis", label: "Jarvis" },
  { id: "classico", label: "Clássico" }
];

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
