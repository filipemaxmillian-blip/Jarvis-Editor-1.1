import { Download, Loader2, Music2, Sparkles, Trash2, Upload } from "lucide-react";
import {
  CAPTION_STYLES,
  EFFECTS,
  INTROS,
  OUTROS,
  formatTime,
  type CaptionStyle,
  type EffectId,
  type IntroId,
  type OutroId,
  type Segment
} from "../lib/types";

interface CaptionsProps {
  segments: Segment[];
  status: string | null;
  busy: boolean;
  enabled: boolean;
  style: CaptionStyle;
  hasVideo: boolean;
  onGenerate: () => void;
  onToggle: (on: boolean) => void;
  onStyle: (style: CaptionStyle) => void;
  onEdit: (index: number, text: string) => void;
  onSeek: (time: number) => void;
  onDownloadSrt: () => void;
  onClear: () => void;
}

export function CaptionsPanel(p: CaptionsProps) {
  return (
    <div className="panel-section">
      <button className="primary-button wide" onClick={p.onGenerate} disabled={!p.hasVideo || p.busy}>
        {p.busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
        {p.segments.length ? "Gerar novamente" : "Gerar legendas automáticas"}
      </button>
      {p.status && <p className="status-line">{p.status}</p>}

      <div className="field-row">
        <span className="field-label">Estilo</span>
        <div className="segmented">
          {CAPTION_STYLES.map((s) => (
            <button key={s.id} className={p.style === s.id ? "on" : ""} onClick={() => p.onStyle(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <label className="toggle">
        <input type="checkbox" checked={p.enabled} onChange={(e) => p.onToggle(e.target.checked)} />
        Mostrar legendas no vídeo
      </label>

      {p.segments.length > 0 && (
        <>
          <div className="segment-list">
            {p.segments.map((s, i) => (
              <div key={i} className="segment">
                <button className="segment-time" onClick={() => p.onSeek(s.start)}>
                  {formatTime(s.start)}
                </button>
                <input value={s.text} onChange={(e) => p.onEdit(i, e.target.value)} aria-label={`Legenda ${i + 1}`} />
              </div>
            ))}
          </div>
          <div className="button-row">
            <button className="ghost-button" onClick={p.onDownloadSrt}>
              <Download size={14} /> Baixar .srt
            </button>
            <button className="ghost-button" onClick={p.onClear}>
              <Trash2 size={14} /> Limpar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface EffectsProps {
  effect: EffectId;
  intro: IntroId;
  outro: OutroId;
  onEffect: (e: EffectId) => void;
  onIntro: (i: IntroId) => void;
  onOutro: (o: OutroId) => void;
}

export function EffectsPanel(p: EffectsProps) {
  return (
    <div className="panel-section">
      <span className="field-label">Efeito</span>
      <div className="effect-grid">
        {EFFECTS.map((e) => (
          <button
            key={e.id}
            className={`effect-card fx-${e.id} ${p.effect === e.id ? "on" : ""}`}
            onClick={() => p.onEffect(e.id)}
          >
            <span className="fx-swatch" />
            <strong>{e.label}</strong>
            <small>{e.hint}</small>
          </button>
        ))}
      </div>

      <div className="field-row">
        <span className="field-label">Entrada</span>
        <div className="segmented">
          {INTROS.map((i) => (
            <button key={i.id} className={p.intro === i.id ? "on" : ""} onClick={() => p.onIntro(i.id)}>
              {i.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field-row">
        <span className="field-label">Saída</span>
        <div className="segmented">
          {OUTROS.map((o) => (
            <button key={o.id} className={p.outro === o.id ? "on" : ""} onClick={() => p.onOutro(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface AudioProps {
  musicName: string | null;
  musicVolume: number;
  videoVolume: number;
  onPickMusic: () => void;
  onRemoveMusic: () => void;
  onMusicVolume: (v: number) => void;
  onVideoVolume: (v: number) => void;
}

export function AudioPanel(p: AudioProps) {
  return (
    <div className="panel-section">
      <label className="slider">
        <span>
          Áudio do vídeo <b>{Math.round(p.videoVolume * 100)}%</b>
        </span>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.05}
          value={p.videoVolume}
          onChange={(e) => p.onVideoVolume(Number(e.target.value))}
        />
      </label>

      {p.musicName ? (
        <div className="music-card">
          <Music2 size={18} />
          <span>{p.musicName}</span>
          <button className="icon-button" onClick={p.onRemoveMusic} aria-label="Remover música">
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <button className="ghost-button wide" onClick={p.onPickMusic}>
          <Upload size={14} /> Adicionar trilha sonora
        </button>
      )}

      <label className="slider">
        <span>
          Volume da música <b>{Math.round(p.musicVolume * 100)}%</b>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={p.musicVolume}
          disabled={!p.musicName}
          onChange={(e) => p.onMusicVolume(Number(e.target.value))}
        />
      </label>
      <p className="status-line">A música começa junto com o corte e repete até o fim.</p>
    </div>
  );
}
