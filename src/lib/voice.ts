export interface Recording {
  stop: () => void;
  result: Promise<Blob>;
}

/** Grava o microfone até `stop()` ou até `maxMs`. */
export async function recordMicrophone(maxMs = 8000): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const result = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
  });

  recorder.start();
  const timer = window.setTimeout(() => stop(), maxMs);
  function stop() {
    window.clearTimeout(timer);
    if (recorder.state !== "inactive") recorder.stop();
  }
  return { stop, result };
}

export function speak(text: string, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("pt"));
  if (voice) utterance.voice = voice;
  utterance.rate = 1.05;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  synth.speak(utterance);
}
