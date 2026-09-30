"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSuggestions, type SuggestionFile } from "@/lib/suggestions";

interface ChatSource {
  id: string;
  filename: string;
  doc_type: string | null;
  similarity: number | null;
  meta?: string;
  best?: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  mode?: "sql" | "semantic";
}

const TYPE_LABELS: Record<string, string> = {
  factura: "Factura",
  recibo: "Recibo",
  nomina: "Nómina",
  contrato: "Contrato",
  otros: "Otros",
};

function ChatIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3C6.9 3 2.75 6.58 2.75 11c0 2.06.9 3.94 2.36 5.3-.1.7-.42 1.7-1.11 2.7 1.62-.2 3.1-.7 4.02-1.3.9.3 1.93.5 2.98.5 5.1 0 9.25-3.58 9.25-7.2S17.1 3 12 3z"
        fill="currentColor"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6L17.6 19 19 17.6l-5.6-5.6L19 6.4 17.6 5 12 10.6 6.4 5z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 19v-4H5M15 5v4h4M9 5v4H5M15 19v-4h4" />
    </svg>
  );
}

function playPing() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.13;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    window.setTimeout(() => {
      ctx.close().catch(() => undefined);
    }, 1200);
  } catch {
    /* audio no disponible en este navegador */
  }
}

export default function Chat({
  onOpenDocument,
  recentFiles,
}: {
  onOpenDocument: (id: string) => void;
  recentFiles: SuggestionFile[];
}) {
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [chats, setChats] = useState<ChatMessage[][]>(() => [[]]);
  const [activeChat, setActiveChat] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busyChats, setBusyChats] = useState<Record<number, boolean>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(activeChat);
  const openRef = useRef(open);
  const [unseen, setUnseen] = useState(0);

  useEffect(() => {
    activeRef.current = activeChat;
    setUnseen(0);
  }, [activeChat]);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnseen(0);
  }, [open]);

  const messages = chats[activeChat] ?? [];
  const input = drafts[activeChat] ?? "";
  const activeBusy = !!busyChats[activeChat];

  const setInput = useCallback(
    (v: string) => {
      const idx = activeRef.current;
      setDrafts((d) => ({ ...d, [idx]: v }));
    },
    []
  );

  const suggestions = useMemo(() => buildSuggestions(recentFiles, 3), [recentFiles]);

  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, busyChats, open]);

  const appendTo = useCallback((idx: number, msg: ChatMessage) => {
    setChats((cs) =>
      cs.map((c, i) => (i === idx ? [...c, msg] : c))
    );
  }, []);

  const announceResponse = useCallback((idx: number) => {
    if (openRef.current && activeChat === idx) return;
    setUnseen((u) => u + 1);
    playPing();
  }, [activeChat]);

  const newChat = () => {
    const idx = chats.length;
    setChats((cs) => [...cs, []]);
    setDrafts((d) => ({ ...d, [idx]: "" }));
    setActiveChat(idx);
  };

  const deleteChat = (i: number) => {
    const target = chats[i];
    if (target?.length && !window.confirm("¿Eliminar esta conversación?")) return;
    const next = chats.filter((_, idx) => idx !== i);
    if (next.length === 0) next.push([]);
    setChats(next);
    setDrafts((d) => {
      const nd: Record<number, string> = {};
      Object.keys(d)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((k, newIdx) => {
          if (k !== i) nd[newIdx] = d[k];
        });
      return nd;
    });
    if (i < activeChat) {
      setActiveChat(activeChat - 1);
    } else {
      setActiveChat(Math.min(i, next.length - 1));
    }
  };

  const send = useCallback(
    async (text?: string) => {
      const idx = activeRef.current;
      const question = (text ?? drafts[idx] ?? "").trim();
      if (!question || busyChats[idx]) return;
      setDrafts((d) => ({ ...d, [idx]: "" }));
      appendTo(idx, { role: "user", content: question });
      setBusyChats((b) => ({ ...b, [idx]: true }));
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Falló la consulta.");
        appendTo(idx, {
          role: "assistant",
          content: data.answer ?? "Sin respuesta.",
          sources: (data.sources as ChatSource[] | undefined) ?? [],
          mode: data.mode === "sql" ? "sql" : "semantic",
        });
        announceResponse(idx);
      } catch (err) {
        appendTo(idx, {
          role: "assistant",
          content: err instanceof Error ? err.message : "Error inesperado.",
        });
        announceResponse(idx);
      } finally {
        setBusyChats((b) => ({ ...b, [idx]: false }));
      }
    },
    [input, busyChats, appendTo, announceResponse]
  );

  return (
    <div className="chat-wrap">
      <button
        type="button"
        className={`chat-fab${open ? " active" : ""}`}
        onClick={() => {
          setOpen((o) => !o);
          setMaximized(false);
        }}
        title="Chat con tus documentos"
        aria-label={open ? "Cerrar chat" : "Abrir chat"}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
        {unseen > 0 && (
          <span className="chat-fab-badge" aria-label={`${unseen} respuestas nuevas`}>
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`chat-panel${maximized ? " maximized" : ""}`}
          role="dialog"
          aria-label="Chat con tus documentos"
        >
          <header className="chat-head">
            <div className="chat-head-top">
              <div>
                <h2>Chat con tus documentos</h2>
                <p className="chat-sub">Búsqueda semántica (pgvector) + SQL con citas a la fuente.</p>
              </div>
              <div className="chat-head-actions">
                <button
                  type="button"
                  className="chat-max"
                  onClick={() => setMaximized((m) => !m)}
                  aria-label={maximized ? "Restaurar chat" : "Maximizar chat"}
                  title={maximized ? "Restaurar tamaño" : "Maximizar"}
                >
                  {maximized ? <MinimizeIcon /> : <MaximizeIcon />}
                </button>
                <button
                  type="button"
                  className="chat-close"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar chat"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            <nav className="chat-tabs" aria-label="Conversaciones">
              {chats.map((c, i) => (
                <span
                  key={i}
                  className={`chat-tab${i === activeChat ? " active" : ""}`}
                >
                  <button
                    type="button"
                    className="chat-tab-btn"
                    onClick={() => setActiveChat(i)}
                    title={`Conversación ${i + 1}`}
                  >
                    {c.length === 0 ? "Nuevo" : `Chat ${i + 1}`}
                    {c.length > 0 && <span className="chat-tab-count">{c.length}</span>}
                  </button>
                  <button
                    type="button"
                    className="chat-tab-del"
                    onClick={() => deleteChat(i)}
                    aria-label={`Eliminar conversación ${i + 1}`}
                    title="Eliminar conversación"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="chat-tab-new"
                onClick={newChat}
                title="Nueva conversación"
                aria-label="Nueva conversación"
              >
                <PlusIcon />
                <span>Nuevo chat</span>
              </button>
            </nav>
          </header>

          <div className="chat-messages" ref={listRef}>
            {messages.length === 0 && !activeBusy ? (
              <p className="chat-empty">
                Pregunta sobre tus documentos guardados o usa alguna de las sugerencias de abajo. Ej:
                «¿Cuál fue el total de la factura de Mi Empresa S.A.?»
              </p>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role}`}>
                  <div className="chat-bubble">
                    {m.mode && m.mode === "sql" && (
                      <span className="chat-mode-tag sql">SQL</span>
                    )}
                    {m.content}
                  </div>
                  {m.sources && m.sources.length > 0 && (
                    <div className="chat-sources">
                      {m.sources.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`chat-source${s.best ? " best" : ""}`}
                          onClick={() => onOpenDocument(s.id)}
                          title={s.best ? "Abrir el PDF más aproximado" : "Abrir documento"}
                        >
                          {s.best && <span className="chat-source-best">≈ PDF</span>}
                          <span className="chat-source-name">{s.filename}</span>
                          {s.doc_type && TYPE_LABELS[s.doc_type] && (
                            <span className={`tag tag-${s.doc_type}`}>{TYPE_LABELS[s.doc_type]}</span>
                          )}
                          {s.meta ? (
                            <span className="chat-source-meta">{s.meta}</span>
                          ) : (
                            <span className="chat-source-score">
                              {(s.similarity ?? 0) > 0
                                ? `${Math.round((s.similarity ?? 0) * 100)}%`
                                : "—"}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            {activeBusy && (
              <div className="chat-msg assistant">
                <div className="chat-bubble busy">
                  <span className="spinner" />
                  <span>Consultando la base de datos y generando respuesta...</span>
                </div>
              </div>
            )}
          </div>

          <footer className="chat-footer">
            {suggestions.length > 0 && (
              <div className="chat-suggestions">
                <span className="chat-suggestions-label">Sugerencias:</span>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="suggestion-chip"
                    onClick={() => send(s)}
                    disabled={activeBusy}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="chat-input">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder="Haz una pregunta sobre tus documentos..."
                disabled={activeBusy}
              />
              <button
                className="btn primary"
                onClick={() => send()}
                disabled={activeBusy || !input.trim()}
              >
                Enviar
              </button>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}