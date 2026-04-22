"use client";

import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";
import { PromptPalette, type PromptCategory } from "./_components/PromptPalette";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  tool_calls?: string[];
  loading?: boolean;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

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
    prompts: [
      { label: "Config WhatsApp", prompt: "Mostrami la configurazione WhatsApp corrente" },
      { label: "Aggiorna WhatsApp", prompt: "Aggiorna la configurazione WhatsApp con Phone Number ID '123456' e WABA ID '789012'" },
      { label: "Config AI", prompt: "Mostrami la configurazione AI corrente" },
      { label: "Aggiorna config AI", prompt: "Aggiorna la mia configurazione AI alle impostazioni consigliate" },
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      <div className="mb-4 shrink-0">
        <h1 className="text-[15px] font-semibold text-slate-100">Agent AI</h1>
        <p className="text-[11px] text-slate-400">
          Assistente intelligente per gestire contatti, campagne e messaggi
        </p>
      </div>

      {/* Thread */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal/15 text-brand-teal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1.27A7 7 0 015.27 19H4a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z" />
                <circle cx="9" cy="14" r="1" fill="currentColor" />
                <circle cx="15" cy="14" r="1" fill="currentColor" />
              </svg>
            </div>
            <h2 className="text-[14px] font-semibold text-slate-100">Ciao! Come posso aiutarti?</h2>
            <p className="mt-1.5 max-w-sm text-[12px] text-slate-400">
              Scrivi una richiesta in linguaggio naturale oppure apri i{" "}
              <span className="text-brand-teal">prompt rapidi</span> dal pulsante qui sotto
              (o con <kbd className="rounded-sm border border-slate-700 bg-brand-navy-light px-1 py-0.5 font-mono text-[10px] text-slate-300">⌘K</kbd>).
            </p>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-card px-4 py-2.5 text-[13px] ${
                    msg.role === "user"
                      ? "bg-brand-teal text-white"
                      : "border border-slate-800 bg-brand-navy-light text-slate-100 shadow-card"
                  }`}
                >
                  {msg.loading ? (
                    <span className="flex items-center gap-2 text-slate-400">
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
                              className="rounded-pill bg-brand-teal/15 px-2 py-0.5 text-[11px] text-brand-teal"
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

      {/* Input Bar — palette stays reachable forever */}
      <div className="shrink-0 border-t border-slate-800 pt-3">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <PromptPalette
            categories={CATEGORIES}
            onPick={(text) => {
              setInput(text);
              // Focus the textarea so the user can edit [ID] placeholders.
              textareaRef.current?.focus();
            }}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendPrompt(input);
              }
            }}
            placeholder="Scrivi un messaggio o apri i prompt rapidi…"
            disabled={sending}
            rows={1}
            className="min-w-0 flex-1 resize-none rounded-card border border-slate-800 bg-brand-navy-light px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="flex items-center gap-1.5 rounded-pill bg-brand-teal px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <IconSendMsg />
            Invia
          </button>
        </form>
        {hasMessages && (
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={resetConversation}
              className="text-[11px] text-slate-400 underline-offset-2 hover:text-brand-teal hover:underline"
            >
              Nuova conversazione
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
