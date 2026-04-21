"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface PlannerSuggestion {
  segment_description: string;
  estimated_audience: number;
  recommended_template_ids: string[];
  best_send_hour_local: number;
  reasoning: string;
  cautions: string[];
}

interface Template {
  id: string;
  name: string;
  category: string;
}

interface Props {
  templates: Template[];
  aiEnabled: boolean;
  onApplyTemplate?: (templateId: string) => void;
}

export function CampaignPlanner({ templates, aiEnabled, onApplyTemplate }: Props) {
  const [open, setOpen] = useState(false);
  const [objective, setObjective] = useState("");
  const [suggestion, setSuggestion] = useState<PlannerSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!aiEnabled) return null;

  async function handleRun() {
    setLoading(true);
    setError(null);
    const res = await apiFetch("/campaigns/planner", {
      method: "POST",
      body: JSON.stringify({ objective }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.detail || "Errore durante la pianificazione.");
      setLoading(false);
      return;
    }
    setSuggestion(body);
    setLoading(false);
  }

  const recommendedTemplate = suggestion
    ? templates.find((t) => suggestion.recommended_template_ids.includes(t.id))
    : null;

  return (
    <div className="rounded-card border border-indigo-500/30 bg-indigo-500/5 p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-indigo-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
            </svg>
            Pianifica con AI
            <span className="rounded-pill bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
              Analisi approfondita · 5 crediti
            </span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-slate-400">
            Descrivi l&apos;obiettivo in linguaggio naturale. Wamply suggerisce segmento, template e orario migliori.
          </div>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-4 w-4 shrink-0 text-indigo-300 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Es: Avviare promo saldi estivi per i clienti Milano che hanno acquistato almeno una volta negli ultimi 6 mesi..."
            rows={3}
            maxLength={1000}
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <div className="text-[10.5px] text-slate-500">
              {objective.length}/1000
            </div>
            <button
              type="button"
              onClick={handleRun}
              disabled={loading || objective.trim().length < 10}
              className="rounded-pill bg-indigo-500 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              {loading ? "Analisi in corso..." : "Pianifica"}
            </button>
          </div>

          {error && (
            <div className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
              {error}
            </div>
          )}

          {suggestion && (
            <div className="space-y-3 rounded-card border border-indigo-500/20 bg-brand-navy-deep/60 p-4">
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-indigo-300">
                  Segmento suggerito
                </div>
                <div className="mt-1 text-[13px] text-slate-100">
                  {suggestion.segment_description}
                </div>
                <div className="mt-1 text-[11.5px] text-slate-400">
                  ~{suggestion.estimated_audience.toLocaleString("it-IT")} destinatari stimati
                </div>
              </div>

              {recommendedTemplate && (
                <div className="flex items-center justify-between rounded-sm border border-slate-800 bg-brand-navy-light px-3 py-2.5">
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wider text-slate-500">
                      Template consigliato
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-slate-100">
                      {recommendedTemplate.name}{" "}
                      <span className="text-slate-400">({recommendedTemplate.category})</span>
                    </div>
                  </div>
                  {onApplyTemplate && (
                    <button
                      type="button"
                      onClick={() => onApplyTemplate(recommendedTemplate.id)}
                      className="rounded-pill bg-brand-teal/20 px-2.5 py-1 text-[11px] font-medium text-brand-teal hover:bg-brand-teal/30"
                    >
                      Usa questo template
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 text-[12px]">
                <svg viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" className="h-4 w-4">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="text-slate-300">
                  Orario consigliato:{" "}
                  <strong className="text-slate-100">
                    {suggestion.best_send_hour_local.toString().padStart(2, "0")}:00
                  </strong>
                </span>
              </div>

              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-indigo-300">
                  Ragionamento
                </div>
                <div className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-300">
                  {suggestion.reasoning}
                </div>
              </div>

              {suggestion.cautions.length > 0 && (
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-amber-400">
                    Attenzione
                  </div>
                  <ul className="mt-1 space-y-1 text-[12px] text-amber-200/80">
                    {suggestion.cautions.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-0.5 text-amber-400">·</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
