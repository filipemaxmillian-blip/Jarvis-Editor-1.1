import { useEffect, useRef, useState } from "react";
import { Mic, Send, Square } from "lucide-react";
import JarvisCore, { type CoreState } from "./JarvisCore";

export interface ChatMessage {
  from: "user" | "jarvis";
  text: string;
}

interface Props {
  messages: ChatMessage[];
  coreState: CoreState;
  listening: boolean;
  onSend: (text: string) => void;
  onMic: () => void;
}

const SUGGESTIONS = [
  "Formato vertical e gerar legendas",
  "Efeito cinema com transições",
  "Marcar início",
  "Exportar"
];

const STATE_LABEL: Record<CoreState, string> = {
  idle: "Pronto",
  listening: "Ouvindo…",
  thinking: "Processando…",
  speaking: "Respondendo"
};

export default function AssistantPanel({ messages, coreState, listening, onSend, onMic }: Props) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  }

  return (
    <div className="assistant">
      <div className="assistant-core">
        <JarvisCore size={112} state={coreState} />
        <div>
          <strong>J.A.R.V.I.S.</strong>
          <small>{STATE_LABEL[coreState]}</small>
        </div>
      </div>

      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.map((m, i) => (
          <p key={i} className={`chat-msg ${m.from}`}>
            {m.text}
          </p>
        ))}
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => onSend(s)}>
            {s}
          </button>
        ))}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <button
          type="button"
          className={`mic-button ${listening ? "on" : ""}`}
          onClick={onMic}
          aria-label={listening ? "Parar de ouvir" : "Falar com o Jarvis"}
          title={listening ? "Parar de ouvir" : "Falar com o Jarvis"}
        >
          {listening ? <Square size={15} fill="currentColor" /> : <Mic size={17} />}
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Diga ou digite um comando…"
          aria-label="Comando para o Jarvis"
        />
        <button type="submit" className="send-button" aria-label="Enviar comando">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
