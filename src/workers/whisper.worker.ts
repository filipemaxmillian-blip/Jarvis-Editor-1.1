import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = false;

const MODEL = "Xenova/whisper-base";

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;

let transcriber: Promise<Transcriber> | null = null;
// Uma transcrição por vez: a sessão ONNX não é reentrante.
let queue: Promise<unknown> = Promise.resolve();

function load() {
  if (!transcriber) {
    transcriber = pipeline("automatic-speech-recognition", MODEL, {
      progress_callback: (data: unknown) =>
        self.postMessage({ type: "progress", data })
    }) as unknown as Promise<Transcriber>;
    transcriber.catch(() => {
      transcriber = null;
    });
  }
  return transcriber;
}

self.onmessage = (event: MessageEvent) => {
  const { id, audio, timestamps } = event.data as {
    id: number;
    audio: Float32Array;
    timestamps: boolean;
  };

  queue = queue.then(async () => {
    try {
      const run = await load();
      const output = await run(audio, {
        language: "portuguese",
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: timestamps
      });
      self.postMessage({ id, type: "result", data: output });
    } catch (error) {
      self.postMessage({ id, type: "error", error: String(error) });
    }
  });
};
