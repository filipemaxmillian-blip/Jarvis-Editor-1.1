export interface AudioGraph {
  ctx: AudioContext;
  videoGain: GainNode;
  musicGain: GainNode;
  recordDest: MediaStreamAudioDestinationNode;
}

/**
 * Passa o áudio do vídeo e da música por ganhos próprios, que tocam nas
 * caixas de som e também alimentam a gravação da exportação.
 */
export function createAudioGraph(video: HTMLVideoElement, music: HTMLAudioElement): AudioGraph {
  const ctx = new AudioContext();
  const recordDest = ctx.createMediaStreamDestination();
  const videoGain = ctx.createGain();
  const musicGain = ctx.createGain();
  ctx.createMediaElementSource(video).connect(videoGain);
  ctx.createMediaElementSource(music).connect(musicGain);
  for (const gain of [videoGain, musicGain]) {
    gain.connect(ctx.destination);
    gain.connect(recordDest);
  }
  return { ctx, videoGain, musicGain, recordDest };
}

const MIME_TYPES = [
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm"
];

export function pickMimeType() {
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/**
 * Grava em tempo real o canvas (com efeitos e legendas já desenhados) e o
 * áudio mixado. Resolve quando o vídeo pausar no fim do corte.
 */
export function recordExport(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  graph: AudioGraph,
  start: () => void
): Promise<Blob> {
  const stream = new MediaStream([
    ...canvas.captureStream(30).getVideoTracks(),
    ...graph.recordDest.stream.getAudioTracks()
  ]);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, {
    mimeType: mimeType || undefined,
    videoBitsPerSecond: 8_000_000
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      stream.getVideoTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    };
    recorder.onerror = () => reject(new Error("Falha ao gravar o vídeo."));
    video.addEventListener("pause", () => recorder.state !== "inactive" && recorder.stop(), { once: true });
    recorder.start(250);
    start();
  });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Captura miniaturas igualmente espaçadas para a linha do tempo. */
export async function captureThumbnails(url: string, count: number, signal: { cancelled: boolean }) {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("thumbnail"));
  });
  const canvas = document.createElement("canvas");
  canvas.height = 72;
  canvas.width = Math.round((72 * video.videoWidth) / video.videoHeight) || 128;
  const ctx = canvas.getContext("2d")!;
  const thumbs: string[] = [];
  for (let i = 0; i < count && !signal.cancelled; i++) {
    video.currentTime = ((i + 0.5) * video.duration) / count;
    await new Promise((r) => video.addEventListener("seeked", r, { once: true }));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    thumbs.push(canvas.toDataURL("image/jpeg", 0.6));
  }
  video.removeAttribute("src");
  video.load();
  return thumbs;
}
