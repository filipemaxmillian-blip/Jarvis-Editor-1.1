import type { CaptionStyle, EffectId, Format, IntroId, OutroId } from "./types";

export type Command =
  | { type: "greet" }
  | { type: "help" }
  | { type: "import" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "seek"; delta: number }
  | { type: "seekStart" }
  | { type: "trimIn" }
  | { type: "trimOut" }
  | { type: "resetTrim" }
  | { type: "captions" }
  | { type: "clearCaptions" }
  | { type: "captionStyle"; style: CaptionStyle }
  | { type: "effect"; effect: EffectId }
  | { type: "intro"; intro: IntroId }
  | { type: "outro"; outro: OutroId }
  | { type: "format"; format: Format }
  | { type: "volume"; target: "music" | "video"; delta?: number; value?: number }
  | { type: "export" };

const NUMBERS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30,
  quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80,
  noventa: 90, cem: 100
};

function toNumber(word: string | undefined, fallback: number) {
  if (!word) return fallback;
  if (/^\d+$/.test(word)) return Number(word);
  return NUMBERS[word] ?? fallback;
}

export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Matcher = [RegExp, (m: RegExpMatchArray) => Command | Command[]];

const MATCHERS: Matcher[] = [
  [/\b(oi|ola|bom dia|boa tarde|boa noite|e ai)\b/, () => ({ type: "greet" })],
  [/\b(ajuda|comandos|o que (voce )?(sabe|consegue|pode) fazer)\b/, () => ({ type: "help" })],
  [/\b(importa\w*|abr\w* (um |o )?video|carrega\w* (um |o )?video)\b/, () => ({ type: "import" })],
  [/\b(export\w*|renderiz\w*|finaliza\w*|salva\w* o video|baixa\w* o video)\b/, () => ({ type: "export" })],

  [/\b(marca\w*|define|definir|corta\w*|corte)\b.*?\b(inicio|comeco)\b/, () => ({ type: "trimIn" })],
  [/\b(marca\w*|define|definir|corta\w*|corte)\b.*?\b(fim|final|termino)\b/, () => ({ type: "trimOut" })],
  [/\b(desfaz\w*|remove\w*|tira\w*|limpa\w*) (o |os )?cortes?\b/, () => ({ type: "resetTrim" })],

  [/\b(volta\w*|ir|vai)\b.*?\b(inicio|comeco)\b/, () => ({ type: "seekStart" })],
  [/\b(avanc\w*|pula\w*|adianta\w*)\b(?: (\w+) segundos?)?/, (m) => ({ type: "seek", delta: toNumber(m[2], 5) })],
  [/\b(volta|voltar|volte|retrocede\w*)\b(?!.*\b(inicio|comeco)\b)(?: (\w+) segundos?)?/, (m) => ({ type: "seek", delta: -toNumber(m[3], 5) })],
  [/\b(pausa\w*|pause|parar|stop)\b/, () => ({ type: "pause" })],
  [/\b(play|toca|tocar|toque|reproduz\w*|roda|rodar|assistir)\b(?! (a )?musica)/, () => ({ type: "play" })],

  [/\b(remove\w*|tira\w*|apaga\w*|limpa\w*|sem) (as |a )?legendas?\b/, () => ({ type: "clearCaptions" })],
  [/\b(gera\w*|cria\w*|faz|faca|fazer|adiciona\w*|coloca\w*|bota\w*|transcrev\w*|liga\w*)\b.*?\blegendas?\b|\blegendar\b|^legendas?$/, () => ({ type: "captions" })],
  [/\bestilo (reels|tiktok|jarvis|classico|simples)\b/, (m) => ({
    type: "captionStyle",
    style: m[1] === "jarvis" ? "jarvis" : m[1] === "classico" || m[1] === "simples" ? "classico" : "reels"
  })],

  [/\b(sem|remove\w*|tira\w*) (o )?(efeito|filtro)\b|\b(efeito|filtro) (normal|original)\b/, () => ({ type: "effect", effect: "none" })],
  [/\bpreto e branco\b|\bmonocromatic\w*/, () => ({ type: "effect", effect: "pb" })],
  [/\bcinema\b|\bcinematografic\w*/, () => ({ type: "effect", effect: "cinema" })],
  [/\bvintage\b|\bretro\b/, () => ({ type: "effect", effect: "vintage" })],
  [/\bneon\b|\bholografic\w*|\bfuturist\w*|\b(efeito|filtro) jarvis\b/, () => ({ type: "effect", effect: "neon" })],
  [/\bglitch\b|\bfalha digital\b/, () => ({ type: "effect", effect: "glitch" })],
  [/\b(zoom lento|zoom progressivo|ken burns|(efeito|filtro) (de )?zoom)\b/, () => ({ type: "effect", effect: "zoom" })],

  [/\bsem transic\w*/, () => [{ type: "intro", intro: "none" }, { type: "outro", outro: "none" }]],
  [/\b(entrada (com |de )?zoom|zoom (na|de) entrada)\b/, () => ({ type: "intro", intro: "zoom" })],
  [/\bflash\b/, () => ({ type: "intro", intro: "flash" })],
  [/\b(fade in|entrada suave|fade de entrada)\b/, () => ({ type: "intro", intro: "fade" })],
  [/\b(fade out|saida suave|final suave|fade de saida|escurec\w* no final)\b/, () => ({ type: "outro", outro: "fade" })],
  [/(?<!sem )\btransic(ao|oes)\b/, () => [{ type: "intro", intro: "fade" }, { type: "outro", outro: "fade" }]],

  [/\bvertical\b|\b(formato|para o|pro|para)( formato)? (reels|tiktok|shorts|stories)\b|\b9 (por|x) 16\b/, () => ({ type: "format", format: "9:16" })],
  [/\bhorizontal\b|\b(formato|para o|pro|para)( formato)? youtube\b|\b16 (por|x) 9\b/, () => ({ type: "format", format: "16:9" })],
  [/\bquadrado\b|\b1 (por|x) 1\b/, () => ({ type: "format", format: "1:1" })],

  [/\b(sem musica|tira\w* a musica|muta\w* a musica|silencia\w* a musica)\b/, () => ({ type: "volume", target: "music", value: 0 })],
  [/\bvolume da musica (?:em |para |pra )?(\d+)/, (m) => ({ type: "volume", target: "music", value: Number(m[1]) / 100 })],
  [/\bmusica\b.*?\b(mais alt\w*|aumenta\w*)|\b(aumenta\w*)\b.*?\bmusica\b/, () => ({ type: "volume", target: "music", delta: 0.2 })],
  [/\bmusica\b.*?\b(mais baix\w*|abaixa\w*|diminu\w*)|\b(abaixa\w*|diminu\w*)\b.*?\bmusica\b/, () => ({ type: "volume", target: "music", delta: -0.2 })],
  [/\b(muta\w*|silencia\w*) o (audio|video)\b|\bvideo (no )?mudo\b/, () => ({ type: "volume", target: "video", value: 0 })],
  [/\bvolume do video (?:em |para |pra )?(\d+)/, (m) => ({ type: "volume", target: "video", value: Number(m[1]) / 100 })]
];

/** Encontra todos os comandos de uma frase, na ordem em que foram falados. */
export function parseCommands(input: string): Command[] {
  const text = normalize(input).replace(/^(ei |ok |hey )?jarvis\b/, "").trim();
  const found: { index: number; commands: Command[] }[] = [];
  const seen = new Set<string>();

  for (const [re, build] of MATCHERS) {
    const m = text.match(re);
    if (!m || m.index === undefined) continue;
    const built = build(m);
    const commands = (Array.isArray(built) ? built : [built]).filter((c) => {
      const key = c.type === "volume" ? `volume-${c.target}` : c.type;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (commands.length) found.push({ index: m.index, commands });
  }

  return found.sort((a, b) => a.index - b.index).flatMap((f) => f.commands);
}

export const HELP_TEXT =
  "Posso importar vídeos, tocar e pausar, marcar início e fim do corte, gerar legendas, " +
  "aplicar efeitos como cinema, preto e branco, neon ou glitch, adicionar transições, " +
  "mudar para vertical e exportar. Experimente: \"formato vertical, efeito cinema e gerar legendas\".";
