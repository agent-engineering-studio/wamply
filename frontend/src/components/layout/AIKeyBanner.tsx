"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

const DISMISS_KEY = "ai_banner_dismissed_at";
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

interface AgentStatus {
  active: boolean;
  reason: "byok" | "plan" | "inactive";
  has_byok: boolean;
  plan_has_agent: boolean;
  system_key_set: boolean;
}

export function AIKeyBanner() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (stored) {
      const when = Number.parseInt(stored, 10);
      if (Number.isFinite(when) && Date.now() - when < DISMISS_TTL_MS) {
        setDismissed(true);
      }
    }
    apiFetch("/settings/agent-status")
      .then((r) => r.json())
      .then((d) => {
        setStatus(d);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  if (!loaded || dismissed || !status || status.active) return null;

  const body = !status.plan_has_agent
    ? "Aggiungi la tua API key Claude per attivare l'intelligenza artificiale: personalizzazione messaggi, generazione template, controllo compliance. L'uso è conteggiato sul tuo account Anthropic."
    : "Il tuo piano include l'agent AI, ma la chiave di sistema non è ancora configurata. Contatta l'amministratore o usa una tua API key personale.";

  return (
    <div className="mb-4 flex items-start gap-3 rounded-card border border-brand-teal/30 bg-brand-teal/5 px-4 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-teal/15">
        <svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" className="h-4 w-4">
          <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1.27A7 7 0 015.27 19H4a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z" />
          <circle cx="9" cy="14" r="1" fill="#0D9488" />
          <circle cx="15" cy="14" r="1" fill="#0D9488" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-brand-teal">
          Attiva l&apos;intelligenza artificiale
        </div>
        <div className="mt-0.5 text-[11.5px] leading-snug text-slate-300">{body}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Link
            href="/settings/ai"
            className="rounded-pill bg-brand-teal px-3 py-1 text-[11.5px] font-semibold text-white shadow-teal hover:bg-brand-teal-dark"
          >
            Configura ora
          </Link>
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-pill border border-slate-700 px-3 py-1 text-[11.5px] font-medium text-slate-200 hover:bg-brand-navy-deep"
          >
            Ottieni API key Claude
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
              <path d="M7 17L17 7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
          </a>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Nascondi per 24 ore"
        className="shrink-0 rounded-sm p-1 text-slate-500 hover:bg-brand-navy-deep hover:text-slate-300"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
