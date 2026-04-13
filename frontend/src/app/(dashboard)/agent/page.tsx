"use client";

import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  tool_calls?: string[];
  loading?: boolean;
}

interface QuickPrompt {
  label: string;
  prompt: string;
}

interface PromptCategory {
  title: string;
  icon: React.ReactNode;
  prompts: QuickPrompt[];
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconDocument = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconBarChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
);

const IconGear = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconSendMsg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

// ─── Prompt categories ────────────────────────────────────────────────────────

const CATEGORIES: PromptCategory[] = [
  {
    title: "Contatti",
    icon: <IconUsers />,
    prompts: [
      { label: "Lista tutti i contatti", prompt: "Mostrami tutti i contatti" },
      { label: "Cerca contatto", prompt: "Cerca i contatti con nome 'Marco'" },
      { label: "Filtra per tag", prompt: "Mostrami i contatti con tag 'vip'" },
      { label: "Aggiungi contatto", prompt: "Aggiungi un nuovo contatto: telefono +39 333 1234567, nome Mario Rossi, tag clienti,vip" },
      { label: "Aggiorna contatto", prompt: "Aggiorna il contatto con ID [ID] impostando il nome a 'Marco Bianchi'" },
      { label: "Elimina contatto", prompt: "Elimina il contatto con ID [ID]" },
      { label: "Importa contatti", prompt: "Importa questi contatti: +39 333 1111111 Anna Verdi, +39 333 2222222 Luca Neri" },
    ],
  },
  {
    title: "Campagne",
    icon: <IconSend />,
    prompts: [
      { label: "Lista campagne", prompt: "Mostrami tutte le campagne" },
      { label: "Campagne attive", prompt: "Quali campagne sono in corso?" },
      { label: "Campagne completate", prompt: "Mostrami le campagne completate" },
      { label: "Campagne in bozza", prompt: "Mostrami le campagne in bozza" },
      { label: "Dettagli campagna", prompt: "Mostrami i dettagli della campagna con ID [ID]" },
      { label: "Crea campagna", prompt: "Crea una nuova campagna chiamata 'Promo Primavera'" },
      { label: "Crea campagna con template", prompt: "Crea la campagna 'Newsletter Aprile' usando il template con ID [ID]" },
      { label: "Aggiorna campagna", prompt: "Aggiorna la campagna con ID [ID] cambiando il nome in 'Promo Estate'" },
      { label: "Avvia campagna", prompt: "Avvia la campagna con ID [ID]" },
      { label: "Pausa campagna", prompt: "Metti in pausa la campagna con ID [ID]" },
      { label: "Riprendi campagna", prompt: "Riprendi la campagna con ID [ID]" },
    ],
  },
  {
    title: "Template",
    icon: <IconDocument />,
    prompts: [
      { label: "Lista template", prompt: "Mostrami tutti i template" },
      { label: "Dettagli template", prompt: "Mostrami i dettagli del template con ID [ID]" },
      { label: "Crea template marketing", prompt: "Crea un nuovo template chiamato 'Benvenuto' di categoria marketing in italiano" },
      { label: "Crea template utility", prompt: "Crea un template 'Conferma Ordine' di categoria utility" },
      { label: "Aggiorna template", prompt: "Aggiorna il template con ID [ID] cambiando il nome in 'Promo Nuova'" },
      { label: "Elimina template", prompt: "Elimina il template con ID [ID]" },
    ],
  },
  {
    title: "Dashboard & Analytics",
    icon: <IconBarChart />,
    prompts: [
      { label: "Panoramica dashboard", prompt: "Mostrami le statistiche della dashboard" },
      { label: "Statistiche campagna", prompt: "Mostrami le statistiche della campagna con ID [ID]" },
      { label: "Storico messaggi", prompt: "Mostrami lo storico degli ultimi messaggi" },
      { label: "Messaggi consegnati", prompt: "Mostrami i messaggi con stato 'delivered'" },
      { label: "Messaggi falliti", prompt: "Mostrami i messaggi falliti" },
      { label: "Messaggi letti", prompt: "Mostrami i messaggi letti" },
    ],
  },
  {
    title: "Impostazioni",
    icon: <IconGear />,
    prompts: [
      { label: "Config WhatsApp", prompt: "Mostrami la configurazione WhatsApp corrente" },
      { label: "Aggiorna WhatsApp", prompt: "Aggiorna la configurazione WhatsApp con Phone Number ID '123456' e WABA ID '789012'" },
      { label: "Config AI", prompt: "Mostrami la configurazione AI corrente" },
      { label: "Cambia modello AI", prompt: "Imposta il modello AI a Claude Sonnet 4" },
      { label: "Cambia temperatura", prompt: "Imposta la temperatura AI a 0.5" },
      { label: "Piano e utilizzo", prompt: "Mostrami il mio piano e l'utilizzo corrente" },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendPrompt(prompt: string) {
    if (!prompt.trim() || sending) return;

    const userMessage: Message = { role: "user", content: prompt };
    const loadingMessage: Message = { role: "assistant", content: "", loading: true };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setInput("");
    setSending(true);

    try {
      const res = await apiFetch("/agent/chat", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: data.error || "Errore nella risposta." },
        ]);
        return;
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response ?? JSON.stringify(data),
        tool_calls: data.tool_calls?.map((tc: { tool: string }) => tc.tool) ?? [],
      };

      setMessages((prev) => [...prev.slice(0, -1), assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: "Errore di comunicazione con l'agent. Riprova." },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendPrompt(input);
  }

  function resetConversation() {
    setMessages([]);
    setInput("");
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-[15px] font-semibold text-brand-ink">Agent AI</h1>
        <p className="text-[11px] text-brand-ink-60">
          Assistente intelligente per gestire contatti, campagne e messaggi
        </p>
      </div>

      {/* Messages / Quick Prompts */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!hasMessages ? (
          /* Quick Prompts Grid */
          <div className="space-y-5 pb-4">
            {CATEGORIES.map((cat) => (
              <div key={cat.title}>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-ink-60">
                  <span className="text-brand-teal-dark">{cat.icon}</span>
                  {cat.title}
                </div>
                <div className="flex flex-wrap gap-2">
                  {cat.prompts.map((qp) => (
                    <button
                      key={qp.label}
                      onClick={() => sendPrompt(qp.prompt)}
                      className="rounded-pill border border-brand-ink-10 bg-white px-3 py-1.5 text-[12px] text-brand-ink shadow-card transition-colors hover:border-brand-teal hover:bg-brand-teal-pale hover:text-brand-teal-dark"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Chat Bubbles */
          <div className="space-y-3 pb-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-card px-4 py-2.5 text-[13px] ${
                    msg.role === "user"
                      ? "bg-brand-green text-white"
                      : "border border-brand-ink-10 bg-white text-brand-ink shadow-card"
                  }`}
                >
                  {msg.loading ? (
                    <span className="flex items-center gap-2 text-brand-ink-60">
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-teal" />
                      Sto pensando...
                    </span>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.tool_calls && msg.tool_calls.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {msg.tool_calls.map((tc, i) => (
                            <span
                              key={i}
                              className="rounded-pill bg-brand-teal-pale px-2 py-0.5 text-[11px] text-brand-teal-dark"
                            >
                              {tc}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="flex-shrink-0 border-t border-brand-ink-10 pt-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Scrivi un messaggio o scegli un prompt rapido…"
            disabled={sending}
            className="min-w-0 flex-1 rounded-card border border-brand-ink-10 bg-white px-3 py-2 text-[13px] text-brand-ink placeholder:text-brand-ink-30 focus:border-brand-teal focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="flex items-center gap-1.5 rounded-pill bg-brand-green px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <IconSendMsg />
            Invia
          </button>
        </form>
        {hasMessages && (
          <div className="mt-2 text-right">
            <button
              onClick={resetConversation}
              className="text-[11px] text-brand-ink-60 underline-offset-2 hover:text-brand-teal-dark hover:underline"
            >
              Nuova conversazione
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
