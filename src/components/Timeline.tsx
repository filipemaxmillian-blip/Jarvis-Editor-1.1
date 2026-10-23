import { useRef } from "react";
import { Music2, Scissors, Type } from "lucide-react";
import { formatTime, type Segment } from "../lib/types";

interface Props {
  duration: number;
  currentTime: number;
  trimIn: number;
  trimOut: number;
  thumbnails: string[];
  segments: Segment[];
  musicName: string | null;
  onSeek: (time: number) => void;
  onTrim: (trimIn: number, trimOut: number) => void;
}

const MIN_CLIP = 0.3;

export default function Timeline({
  duration,
  currentTime,
  trimIn,
  trimOut,
  thumbnails,
  segments,
  musicName,
  onSeek,
  onTrim
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = (t: number) => `${(t / duration) * 100}%`;

  function timeAt(clientX: number) {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
  }

  function startDrag(handle: "in" | "out") {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const t = timeAt(ev.clientX);
        if (handle === "in") onTrim(Math.min(t, trimOut - MIN_CLIP), trimOut);
        else onTrim(trimIn, Math.max(t, trimIn + MIN_CLIP));
      };
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    };
  }

  function nudge(handle: "in" | "out") {
    return (e: React.KeyboardEvent) => {
      const step = e.key === "ArrowLeft" ? -0.5 : e.key === "ArrowRight" ? 0.5 : 0;
      if (!step) return;
      e.preventDefault();
      if (handle === "in") onTrim(Math.max(0, Math.min(trimIn + step, trimOut - MIN_CLIP)), trimOut);
      else onTrim(trimIn, Math.min(duration, Math.max(trimOut + step, trimIn + MIN_CLIP)));
    };
  }

  return (
    <div className="timeline-body">
      <div className="track-label">
        <Scissors size={13} /> Vídeo
      </div>
      <div
        className="video-track"
        ref={trackRef}
        onPointerDown={(e) => onSeek(timeAt(e.clientX))}
      >
        <div className="thumbs">
          {thumbnails.map((src, i) => (
            <img key={i} src={src} alt="" draggable={false} />
          ))}
        </div>
        <div className="trim-shade" style={{ left: 0, width: pct(trimIn) }} />
        <div className="trim-shade" style={{ left: pct(trimOut), right: 0 }} />
        <div className="trim-window" style={{ left: pct(trimIn), width: pct(trimOut - trimIn) }} />
        <div
          className="trim-handle"
          style={{ left: pct(trimIn) }}
          onPointerDown={startDrag("in")}
          onKeyDown={nudge("in")}
          role="slider"
          tabIndex={0}
          aria-label="Início do corte"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={trimIn}
          aria-valuetext={formatTime(trimIn)}
        />
        <div
          className="trim-handle end"
          style={{ left: pct(trimOut) }}
          onPointerDown={startDrag("out")}
          onKeyDown={nudge("out")}
          role="slider"
          tabIndex={0}
          aria-label="Fim do corte"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={trimOut}
          aria-valuetext={formatTime(trimOut)}
        />
        <div className="playhead" style={{ left: pct(currentTime) }} />
      </div>

      <div className="track-label">
        <Type size={13} /> Legendas
      </div>
      <div className="lane">
        {segments.map((s, i) => (
          <div
            key={i}
            className="lane-block caption-block"
            style={{ left: pct(s.start), width: pct(Math.max(s.end - s.start, 0.2)) }}
            title={s.text}
            onClick={() => onSeek(s.start)}
          >
            {s.text}
          </div>
        ))}
        {!segments.length && <span className="lane-empty">Sem legendas</span>}
      </div>

      <div className="track-label">
        <Music2 size={13} /> Música
      </div>
      <div className="lane">
        {musicName ? (
          <div className="lane-block music-block" style={{ left: pct(trimIn), width: pct(trimOut - trimIn) }}>
            {musicName}
          </div>
        ) : (
          <span className="lane-empty">Sem trilha</span>
        )}
      </div>
    </div>
  );
}
