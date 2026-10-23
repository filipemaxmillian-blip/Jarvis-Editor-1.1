export type CoreState = "idle" | "listening" | "thinking" | "speaking";

interface Props {
  size?: number;
  state?: CoreState;
}

/** Núcleo holográfico animado do Jarvis (anéis girando + reator). */
export default function JarvisCore({ size = 180, state = "idle" }: Props) {
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className={`jarvis-core core-${state}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 200 200">
        <defs>
          <radialGradient id="core-glow">
            <stop offset="0%" stopColor="#e9fbff" />
            <stop offset="35%" stopColor="#73d8ff" />
            <stop offset="100%" stopColor="#6485ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="ring ring-ticks">
          {ticks.map((i) => (
            <line
              key={i}
              x1="100"
              y1="6"
              x2="100"
              y2={i % 5 === 0 ? 16 : 11}
              transform={`rotate(${i * 6} 100 100)`}
            />
          ))}
        </g>

        <circle className="ring ring-dash" cx="100" cy="100" r="78" />
        <circle className="ring ring-arc" cx="100" cy="100" r="66" />
        <circle className="ring ring-dash-inner" cx="100" cy="100" r="54" />

        <g className="ring ring-segments">
          {[0, 120, 240].map((a) => (
            <path key={a} d="M100 58 A42 42 0 0 1 136.4 79" transform={`rotate(${a} 100 100)`} />
          ))}
        </g>

        <circle className="core-glow" cx="100" cy="100" r="40" fill="url(#core-glow)" />
        <circle className="core-center" cx="100" cy="100" r="16" />
      </svg>
    </div>
  );
}
