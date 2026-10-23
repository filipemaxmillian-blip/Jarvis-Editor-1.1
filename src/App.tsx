import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Bot,
  Clock3,
  Download,
  Film,
  FolderOpen,
  MonitorPlay,
  Pause,
  Play,
  Scissors,
  Settings,
  Sparkles,
  Type,
  Upload,
  WandSparkles
} from "lucide-react";
import AssistantPanel, { type ChatMessage } from "./components/AssistantPanel";
import JarvisCore, { type CoreState } from "./components/JarvisCore";
import { AudioPanel, CaptionsPanel, EffectsPanel } from "./components/Panels";
import Timeline from "./components/Timeline";
import { groupWords, segmentsToWords, toSrt } from "./lib/captions";
import { HELP_TEXT, parseCommands, type Command } from "./lib/commands";
import {
  captureThumbnails,
  createAudioGraph,
  downloadBlob,
  recordExport,
  type AudioGraph
} from "./lib/media";
import { renderFrame } from "./lib/renderer";
import {
  decodeAudio,
  getModelStatus,
  onModelStatus,
  transcribeSegments,
  transcribeText,
  type ModelStatus
} from "./lib/transcriber";
import {
  EFFECTS,
  FORMAT_SIZE,
  formatTime,
  type CaptionStyle,
  type EffectId,
  type Format,
  type IntroId,
  type OutroId,
  type RenderSettings,
  type Segment
} from "./lib/types";
import { recordMicrophone, speak, type Recording } from "./lib/voice";

type Tab = "assistant" | "captions" | "effects" | "audio";

const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
  { id: "assistant", label: "Jarvis", icon: Bot },
  { id: "captions", label: "Legendas", icon: Type },
  { id: "effects", label: "Efeitos", icon: WandSparkles },
  { id: "audio", label: "Áudio", icon: AudioLines }
];

const FORMATS: Format[] = ["16:9", "9:16", "1:1"];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [trimIn, setTrimIn] = useState(0);
  const [trimOut, setTrimOut] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  const [format, setFormat] = useState<Format>("9:16");
  const [effect, setEffect] = useState<EffectId>("none");
  const [intro, setIntro] = useState<IntroId>("none");
  const [outro, setOutro] = useState<OutroId>("none");

  const [segments, setSegments] = useState<Segment[]>([]);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("reels");
  const [captionsOn, setCaptionsOn] = useState(true);
  const [captionBusy, setCaptionBusy] = useState(false);
  const [captionStatus, setCaptionStatus] = useState<string | null>(null);

  const [music, setMusic] = useState<{ name: string; url: string } | null>(null);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const [videoVolume, setVideoVolume] = useState(1);

  const [tab, setTab] = useState<Tab>("assistant");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      from: "jarvis",
      text: "Olá! Sou o Jarvis. Importe um vídeo e me diga o que fazer — por voz ou digitando."
    }
  ]);
  const [coreState, setCoreState] = useState<CoreState>("idle");
  const [listening, setListening] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus>(getModelStatus());
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const graphRef = useRef<AudioGraph | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  const exportCancelledRef = useRef(false);

  const groups = useMemo(
    () => groupWords(segmentsToWords(segments), captionStyle === "classico" ? 7 : 3),
    [segments, captionStyle]
  );

  const settingsRef = useRef<RenderSettings>(null!);
  settingsRef.current = { format, effect, intro, outro, captionStyle, captionsOn, groups, trimIn, trimOut };

  useEffect(() => onModelStatus(setModelStatus), []);

  // Tamanho real do quadro exportado.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    [canvas.width, canvas.height] = FORMAT_SIZE[format];
  }, [format, videoUrl]);

  // Loop de renderização: vídeo + efeitos + legendas desenhados no canvas.
  useEffect(() => {
    if (!videoUrl) return;
    let frame = 0;
    let lastUi = 0;
    const loop = (now: number) => {
      const video = videoRef.current;
      const ctx = canvasRef.current?.getContext("2d");
      if (video && ctx) {
        const s = settingsRef.current;
        if (!video.paused && video.currentTime >= s.trimOut) {
          video.pause();
          video.currentTime = s.trimOut;
        }
        renderFrame(ctx, video, s, video.currentTime, now);
        if (now - lastUi > 66) {
          lastUi = now;
          setCurrentTime(video.currentTime);
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [videoUrl]);

  useEffect(() => {
    if (!videoUrl) return;
    const signal = { cancelled: false };
    setThumbnails([]);
    captureThumbnails(videoUrl, 14, signal)
      .then((t) => !signal.cancelled && setThumbnails(t))
      .catch(() => undefined);
    return () => {
      signal.cancelled = true;
    };
  }, [videoUrl]);

  useEffect(() => {
    const graph = graphRef.current;
    if (graph) {
      graph.videoGain.gain.value = videoVolume;
      graph.musicGain.gain.value = musicVolume;
    }
  }, [videoVolume, musicVolume]);

  const ensureGraph = useCallback(() => {
    if (!graphRef.current && videoRef.current && musicRef.current) {
      graphRef.current = createAudioGraph(videoRef.current, musicRef.current);
      graphRef.current.videoGain.gain.value = videoVolume;
      graphRef.current.musicGain.gain.value = musicVolume;
    }
    graphRef.current?.ctx.resume();
    return graphRef.current;
  }, [videoVolume, musicVolume]);

  // ---------- Reprodução ----------

  function play() {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    ensureGraph();
    const s = settingsRef.current;
    if (video.currentTime < s.trimIn || video.currentTime >= s.trimOut - 0.05) {
      video.currentTime = s.trimIn;
    }
    video.play().catch(() => undefined);
  }

  function pause() {
    videoRef.current?.pause();
  }

  function seek(time: number) {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = clamp(time, 0, duration);
    setCurrentTime(video.currentTime);
  }

  function syncMusic() {
    const video = videoRef.current;
    const track = musicRef.current;
    if (!video || !track || !music) return;
    if (Number.isFinite(track.duration) && track.duration > 0) {
      const offset = Math.max(0, video.currentTime - settingsRef.current.trimIn);
      track.currentTime = offset % track.duration;
    }
    if (!video.paused) track.play().catch(() => undefined);
  }

  function setTrim(nextIn: number, nextOut: number) {
    setTrimIn(nextIn);
    setTrimOut(nextOut);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.code !== "Space" || /INPUT|TEXTAREA|BUTTON|SELECT/.test(target.tagName) || target.isContentEditable) return;
      e.preventDefault();
      if (videoRef.current?.paused) play();
      else pause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- Mídia ----------

  function importVideo(file: File) {
    if (!file.type.startsWith("video/")) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setSegments([]);
    setCaptionStatus(null);
    setCurrentTime(0);
    setPlaying(false);
  }

  function onLoadedMetadata() {
    const video = videoRef.current!;
    const d = Number.isFinite(video.duration) ? video.duration : 0;
    setDuration(d);
    setTrim(0, d);
  }

  function importMusic(file: File) {
    if (!file.type.startsWith("audio/")) return;
    if (music) URL.revokeObjectURL(music.url);
    setMusic({ name: file.name.replace(/\.[^.]+$/, ""), url: URL.createObjectURL(file) });
  }

  function removeMusic() {
    if (music) URL.revokeObjectURL(music.url);
    musicRef.current?.pause();
    setMusic(null);
  }

  // ---------- Legendas ----------

  async function generateCaptions(): Promise<string> {
    if (!videoFile) return "Primeiro importe um vídeo.";
    if (captionBusy) return "Já estou gerando as legendas.";
    setCaptionBusy(true);
    setTab((t) => (t === "assistant" ? t : "captions"));
    try {
      setCaptionStatus("Extraindo o áudio do vídeo…");
      const audio = await decodeAudio(videoFile);
      setCaptionStatus("Transcrevendo a fala…");
      const result = await transcribeSegments(audio, duration);
      setSegments(result);
      setCaptionsOn(true);
      const msg = result.length
        ? `Pronto: ${result.length} legendas geradas.`
        : "Não encontrei fala nesse vídeo.";
      setCaptionStatus(msg);
      return msg;
    } catch (error) {
      const msg = `Não consegui gerar as legendas: ${(error as Error).message}`;
      setCaptionStatus(msg);
      return msg;
    } finally {
      setCaptionBusy(false);
    }
  }

  // ---------- Exportação ----------

  async function exportVideo(): Promise<string> {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !videoUrl) return "Primeiro importe um vídeo.";
    if (exporting) return "A exportação já está em andamento.";
    const graph = ensureGraph();
    if (!graph) return "Não consegui preparar o áudio para exportar.";

    video.pause();
    exportCancelledRef.current = false;
    setExporting(true);
    try {
      video.currentTime = settingsRef.current.trimIn;
      await new Promise((r) => video.addEventListener("seeked", r, { once: true }));
      const blob = await recordExport(canvas, video, graph, () => {
        video.play().catch(() => undefined);
      });
      if (exportCancelledRef.current) return "Exportação cancelada.";
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const base = videoFile?.name.replace(/\.[^.]+$/, "") ?? "video";
      downloadBlob(blob, `${base}-jarvis.${ext}`);
      return `Vídeo exportado em ${ext.toUpperCase()}.`;
    } catch (error) {
      return `A exportação falhou: ${(error as Error).message}`;
    } finally {
      setExporting(false);
    }
  }

  function cancelExport() {
    exportCancelledRef.current = true;
    videoRef.current?.pause();
  }

  // ---------- Assistente ----------

  function reply(text: string, voice: boolean) {
    setMessages((m) => [...m, { from: "jarvis", text }]);
    if (voice) {
      setCoreState("speaking");
      speak(text, () => setCoreState("idle"));
    } else {
      setCoreState("idle");
    }
  }

  const NEEDS_VIDEO = new Set<Command["type"]>([
    "play", "pause", "seek", "seekStart", "trimIn", "trimOut", "resetTrim", "captions", "export"
  ]);

  async function runCommand(cmd: Command): Promise<string> {
    if (NEEDS_VIDEO.has(cmd.type) && !videoUrl) return "Primeiro importe um vídeo.";
    const video = videoRef.current;
    const t = video?.currentTime ?? 0;
    const s = settingsRef.current;
    switch (cmd.type) {
      case "greet":
        return "Olá! Pronto para editar. Diga \"ajuda\" para ver o que sei fazer.";
      case "help":
        return HELP_TEXT;
      case "import":
        videoInputRef.current?.click();
        return "Abrindo o seletor de vídeos.";
      case "play":
        play();
        return "Reproduzindo.";
      case "pause":
        pause();
        return "Pausado.";
      case "seek":
        seek(t + cmd.delta);
        return cmd.delta > 0 ? `Avancei ${cmd.delta} segundos.` : `Voltei ${-cmd.delta} segundos.`;
      case "seekStart":
        seek(s.trimIn);
        return "Voltei para o início.";
      case "trimIn":
        if (t >= s.trimOut - 0.3) return "O início precisa ficar antes do fim do corte.";
        setTrim(t, s.trimOut);
        return `Início do corte marcado em ${formatTime(t)}.`;
      case "trimOut":
        if (t <= s.trimIn + 0.3) return "O fim precisa ficar depois do início do corte.";
        setTrim(s.trimIn, t);
        return `Fim do corte marcado em ${formatTime(t)}.`;
      case "resetTrim":
        setTrim(0, duration);
        return "Cortes removidos.";
      case "captions":
        return generateCaptions();
      case "clearCaptions":
        setSegments([]);
        return "Legendas removidas.";
      case "captionStyle":
        setCaptionStyle(cmd.style);
        return `Legendas no estilo ${cmd.style === "classico" ? "clássico" : cmd.style}.`;
      case "effect":
        setEffect(cmd.effect);
        return cmd.effect === "none"
          ? "Efeito removido."
          : `Efeito ${EFFECTS.find((e) => e.id === cmd.effect)!.label} aplicado.`;
      case "intro":
        setIntro(cmd.intro);
        return cmd.intro === "none" ? "Transição de entrada removida." : `Entrada com ${cmd.intro}.`;
      case "outro":
        setOutro(cmd.outro);
        return cmd.outro === "none" ? "Transição de saída removida." : "Saída com fade.";
      case "format":
        setFormat(cmd.format);
        return `Formato ${cmd.format}${cmd.format === "9:16" ? ", ideal para Reels, TikTok e Shorts" : ""}.`;
      case "volume": {
        const current = cmd.target === "music" ? musicVolume : videoVolume;
        const max = cmd.target === "music" ? 1 : 1.5;
        const next = clamp(cmd.value ?? current + (cmd.delta ?? 0), 0, max);
        if (cmd.target === "music") setMusicVolume(next);
        else setVideoVolume(next);
        return `Volume ${cmd.target === "music" ? "da música" : "do vídeo"} em ${Math.round(next * 100)}%.`;
      }
      case "export":
        return exportVideo();
    }
  }

  async function execute(text: string, voice: boolean) {
    const commands = parseCommands(text);
    if (!commands.length) {
      reply("Não entendi esse comando. Diga \"ajuda\" para ver exemplos.", voice);
      return;
    }
    setCoreState("thinking");
    const answers: string[] = [];
    for (const cmd of commands) {
      if (cmd.type === "captions" || cmd.type === "export") {
        setMessages((m) => [
          ...m,
          { from: "jarvis", text: cmd.type === "captions" ? "Gerando legendas…" : "Exportando o vídeo…" }
        ]);
      }
      answers.push(await runCommand(cmd));
    }
    reply(answers.join(" "), voice);
  }

  // Comandos de voz terminam depois de um await; o ref garante o estado atual.
  const executeRef = useRef(execute);
  executeRef.current = execute;

  function sendText(text: string) {
    setMessages((m) => [...m, { from: "user", text }]);
    executeRef.current(text, false);
  }

  async function toggleMic() {
    if (recordingRef.current) {
      recordingRef.current.stop();
      return;
    }
    try {
      const recording = await recordMicrophone();
      recordingRef.current = recording;
      setListening(true);
      setCoreState("listening");
      const blob = await recording.result;
      recordingRef.current = null;
      setListening(false);
      setCoreState("thinking");
      if (getModelStatus().state !== "ready") {
        setMessages((m) => [...m, { from: "jarvis", text: "Carregando meu módulo de voz…" }]);
      }
      const text = await transcribeText(await decodeAudio(blob));
      if (!text) {
        reply("Não consegui ouvir. Tente de novo.", true);
        return;
      }
      setMessages((m) => [...m, { from: "user", text }]);
      await executeRef.current(text, true);
    } catch (error) {
      recordingRef.current = null;
      setListening(false);
      reply(`Não consegui usar o microfone: ${(error as Error).message}`, false);
    }
  }

  // ---------- Interface ----------

  const modelLabel =
    modelStatus.state === "loading"
      ? `Baixando IA ${Math.round(modelStatus.progress * 100)}%`
      : modelStatus.state === "ready"
        ? "IA de voz pronta"
        : modelStatus.state === "error"
          ? "Falha ao carregar a IA"
          : "Online";

  const captionLine =
    captionBusy && modelStatus.state === "loading"
      ? `Baixando o modelo de IA (só no primeiro uso): ${Math.round(modelStatus.progress * 100)}%`
      : captionStatus;

  const exportProgress = trimOut > trimIn ? clamp((currentTime - trimIn) / (trimOut - trimIn), 0, 1) : 0;

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type.startsWith("audio/")) importMusic(file);
    else importVideo(file);
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Sparkles size={24} />
          </div>
          <div>
            <h1>JARVIS</h1>
            <span>VIDEO EDITOR</span>
          </div>
        </div>

        <p className="section-label">WORKSPACE</p>

        <button className="nav-item active">
          <MonitorPlay size={19} /> Editor
        </button>

        <button className="nav-item">
          <FolderOpen size={19} /> Meus projetos
        </button>

        <button className="nav-item">
          <Film size={19} /> Biblioteca de mídia
        </button>

        <div className="sidebar-bottom">
          <div className="ai-status">
            <span className={`status-dot ${modelStatus.state}`} />
            <div>
              <strong>JARVIS AI</strong>
              <small>{modelLabel}</small>
            </div>
          </div>

          <button className="nav-item">
            <Settings size={19} /> Configurações
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">SEU ESTÚDIO CRIATIVO</span>
            <h2>Vamos editar, Felipe.</h2>
          </div>
          <div className="topbar-actions">
            {videoUrl && (
              <button className="primary-button" onClick={() => exportVideo().then((m) => reply(m, false))} disabled={exporting}>
                <Download size={17} /> Exportar
              </button>
            )}
            <div className="avatar">J</div>
          </div>
        </header>

        {!videoUrl && (
          <section className="welcome">
            <div className="welcome-content">
              <span className="pill">
                <Sparkles size={14} />
                INTELIGÊNCIA ARTIFICIAL
              </span>

              <h2>
                Suas ideias.<br />
                Nossa próxima criação.
              </h2>

              <p>
                Legendas automáticas, efeitos, transições e um assistente de voz. Prepare seus vídeos para
                Reels, TikTok e Shorts em um só lugar.
              </p>

              <button className="primary-button" onClick={() => videoInputRef.current?.click()}>
                <Upload size={18} />
                Importar vídeos
              </button>
            </div>

            <div className="hero-icon">
              <JarvisCore size={200} />
            </div>
          </section>
        )}

        <div className="section-heading">
          <div>
            <h3>Área de edição</h3>
            <p>{videoFile ? videoFile.name : "Seu próximo vídeo começa aqui."}</p>
          </div>
          <span className="project-count">{videoFile ? `CORTE ${formatTime(trimOut - trimIn)}` : "NOVO PROJETO"}</span>
        </div>

        <section className="editor-grid">
          <div className="preview-panel hud">
            <div className="panel-heading">
              <span>
                <MonitorPlay size={17} />
                PRÉ-VISUALIZAÇÃO
              </span>
              <div className="segmented small" role="group" aria-label="Formato">
                {FORMATS.map((f) => (
                  <button key={f} className={format === f ? "on" : ""} onClick={() => setFormat(f)}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div
              className={`preview-screen ${dragOver ? "drag" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <span className="hud-corner tl" />
              <span className="hud-corner tr" />
              <span className="hud-corner bl" />
              <span className="hud-corner br" />

              {videoUrl ? (
                <canvas
                  ref={canvasRef}
                  className="preview-canvas"
                  onClick={() => (playing ? pause() : play())}
                />
              ) : (
                <button className="empty-preview" onClick={() => videoInputRef.current?.click()}>
                  <span className="play-circle">
                    <Play size={28} fill="currentColor" />
                  </span>
                  <p>Seu vídeo aparecerá aqui</p>
                  <small>Clique ou arraste um vídeo para começar</small>
                </button>
              )}
            </div>

            <div className="preview-footer">
              <span className="transport">
                <button
                  className="icon-button round"
                  onClick={() => (playing ? pause() : play())}
                  disabled={!videoUrl}
                  aria-label={playing ? "Pausar" : "Reproduzir"}
                >
                  {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                </button>
                <Clock3 size={15} />
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <span className="transport">
                <button className="ghost-button" disabled={!videoUrl} onClick={() => runCommand({ type: "trimIn" }).then((m) => reply(m, false))}>
                  <Scissors size={13} /> Marcar início
                </button>
                <button className="ghost-button" disabled={!videoUrl} onClick={() => runCommand({ type: "trimOut" }).then((m) => reply(m, false))}>
                  <Scissors size={13} /> Marcar fim
                </button>
              </span>
            </div>
          </div>

          <div className="tools-panel">
            <div className="tabs" role="tablist">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  className={tab === id ? "on" : ""}
                  onClick={() => setTab(id)}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>

            <div className="tab-body">
              {tab === "assistant" && (
                <AssistantPanel
                  messages={messages}
                  coreState={coreState}
                  listening={listening}
                  onSend={sendText}
                  onMic={toggleMic}
                />
              )}
              {tab === "captions" && (
                <CaptionsPanel
                  segments={segments}
                  status={captionLine}
                  busy={captionBusy}
                  enabled={captionsOn}
                  style={captionStyle}
                  hasVideo={!!videoUrl}
                  onGenerate={generateCaptions}
                  onToggle={setCaptionsOn}
                  onStyle={setCaptionStyle}
                  onEdit={(i, text) => setSegments((all) => all.map((s, j) => (j === i ? { ...s, text } : s)))}
                  onSeek={seek}
                  onDownloadSrt={() =>
                    downloadBlob(new Blob([toSrt(segments)], { type: "text/plain" }), "legendas.srt")
                  }
                  onClear={() => setSegments([])}
                />
              )}
              {tab === "effects" && (
                <EffectsPanel
                  effect={effect}
                  intro={intro}
                  outro={outro}
                  onEffect={setEffect}
                  onIntro={setIntro}
                  onOutro={setOutro}
                />
              )}
              {tab === "audio" && (
                <AudioPanel
                  musicName={music?.name ?? null}
                  musicVolume={musicVolume}
                  videoVolume={videoVolume}
                  onPickMusic={() => musicInputRef.current?.click()}
                  onRemoveMusic={removeMusic}
                  onMusicVolume={setMusicVolume}
                  onVideoVolume={setVideoVolume}
                />
              )}
            </div>
          </div>
        </section>

        <section className="timeline">
          <div className="timeline-heading">
            <span>
              <Scissors size={17} />
              LINHA DO TEMPO
            </span>
            <span>{formatTime(currentTime)}</span>
          </div>

          <div className="timeline-track">
            {videoUrl && duration > 0 ? (
              <Timeline
                duration={duration}
                currentTime={currentTime}
                trimIn={trimIn}
                trimOut={trimOut}
                thumbnails={thumbnails}
                segments={segments}
                musicName={music?.name ?? null}
                onSeek={seek}
                onTrim={setTrim}
              />
            ) : (
              <div className="timeline-empty">Importe um vídeo para iniciar sua edição</div>
            )}
          </div>
        </section>

        <footer>
          <span>
            JARVIS EDITOR
            <span className="version"> v1.1</span>
          </span>
          <span>Feito para criar. Projetado para acelerar.</span>
        </footer>
      </section>

      {exporting && (
        <div className="export-overlay" role="dialog" aria-modal="true" aria-label="Exportando vídeo">
          <div className="export-card">
            <JarvisCore size={130} state="thinking" />
            <strong>Renderizando seu vídeo</strong>
            <small>A exportação acontece em tempo real. Mantenha esta janela aberta.</small>
            <div className="progress">
              <span style={{ width: `${exportProgress * 100}%` }} />
            </div>
            <small>{Math.round(exportProgress * 100)}%</small>
            <button className="ghost-button" onClick={cancelExport}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        className="source-media"
        src={videoUrl ?? undefined}
        playsInline
        preload="auto"
        onLoadedMetadata={onLoadedMetadata}
        onPlay={() => {
          setPlaying(true);
          syncMusic();
        }}
        onPause={() => {
          setPlaying(false);
          musicRef.current?.pause();
        }}
        onSeeked={syncMusic}
      />
      <audio ref={musicRef} className="source-media" src={music?.url} loop preload="auto" />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importVideo(file);
          e.target.value = "";
        }}
      />
      <input
        ref={musicInputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importMusic(file);
          e.target.value = "";
        }}
      />
    </main>
  );
}
