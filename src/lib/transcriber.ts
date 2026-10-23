import type { Segment } from "./types";

export type ModelStatus =
  | { state: "idle" }
  | { state: "loading"; progress: number }
  | { state: "ready" }
  | { state: "error"; message: string };

interface Chunk {
  text: string;
  timestamp: [number, number | null];
}

interface AsrOutput {
  text: string;
  chunks?: Chunk[];
}

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (v: AsrOutput) => void; reject: (e: Error) => void }>();
const listeners = new Set<(status: ModelStatus) => void>();
const files = new Map<string, { loaded: number; total: number }>();
let status: ModelStatus = { state: "idle" };

function emit(next: ModelStatus) {
  status = next;
  listeners.forEach((fn) => fn(status));
}

function handleProgress(data: { status: string; file?: string; loaded?: number; total?: number }) {
  if (data.status === "ready") {
    emit({ state: "ready" });
    return;
  }
  if (data.status === "progress" && data.file && data.total) {
    files.set(data.file, { loaded: data.loaded ?? 0, total: data.total });
  }
  if (status.state !== "ready") {
    let loaded = 0;
    let total = 0;
    files.forEach((f) => {
      loaded += f.loaded;
      total += f.total;
    });
    emit({ state: "loading", progress: total ? loaded / total : 0 });
  }
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("../workers/whisper.worker.ts", import.meta.url), {
      type: "module"
    });
    worker.onmessage = (event) => {
      const { id, type, data, error } = event.data;
      if (type === "progress") {
        handleProgress(data);
      } else if (type === "result") {
        pending.get(id)?.resolve(data);
        pending.delete(id);
      } else if (type === "error") {
        const message = /fetch|network/i.test(error)
          ? "não consegui baixar o modelo de IA. Verifique a internet (ela só é necessária no primeiro uso)."
          : error;
        if (status.state !== "ready") emit({ state: "error", message });
        pending.get(id)?.reject(new Error(message));
        pending.delete(id);
      }
    };
  }
  return worker;
}

export function getModelStatus() {
  return status;
}

export function onModelStatus(fn: (status: ModelStatus) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Decodifica o áudio de qualquer mídia para mono 16 kHz, o formato do Whisper. */
export async function decodeAudio(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    throw new Error("Não encontrei uma trilha de áudio nesse arquivo.");
  } finally {
    ctx.close();
  }
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function run(audio: Float32Array, timestamps: boolean) {
  const id = nextId++;
  return new Promise<AsrOutput>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (status.state === "idle" || status.state === "error") emit({ state: "loading", progress: 0 });
    getWorker().postMessage({ id, audio, timestamps }, [audio.buffer]);
  });
}

export async function transcribeSegments(audio: Float32Array, duration: number): Promise<Segment[]> {
  const output = await run(audio, true);
  const chunks = output.chunks ?? [{ text: output.text, timestamp: [0, duration] as [number, number] }];
  return chunks
    .map((c) => ({
      start: c.timestamp[0],
      end: c.timestamp[1] ?? Math.min(duration, c.timestamp[0] + 3),
      text: c.text.trim()
    }))
    .filter((s) => s.text && !/^\[.*\]$|^\(.*\)$/.test(s.text));
}

export async function transcribeText(audio: Float32Array) {
  const output = await run(audio, false);
  return output.text.trim();
}
