"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { CreditBadge } from "@/components/shared/CreditBadge";

interface Insight {
  headline: string;
  observations: string[];
  next_action: string;
}

interface Props {
  aiEnabled: boolean;
}

export function DashboardInsight({ aiEnabled }: Props) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/campaigns/dashboard-insight", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Analisi non disponibile.");
      setInsight(body as Insight);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
    } finally {
      setLoading(false);
    }
  }

  if (dismissed) return null;

  return (
    <div className="mb-5 rounded-card border border-indigo-500/30 bg-indigo-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-indigo-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
              <path d="M19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
            </svg>
            {insight ? "Analisi AI" : "Chiedi all'AI cosa notare"}
            <CreditBadge operation="dashboard_insight" />
          </div>
          <div className="mt-0.5 text-[11.5px] text-slate-400">
            {insight
              ? "Osservazioni sulle ultime 10 campagne e un suggerimento d'azione."
              : "Claude Sonnet guarda i tuoi KPI e ti dice cosa sta andando bene e cosa migliorare."}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!insight && (
            <button
              type="button"
              onClick={run}
              disabled={loading || !aiEnabled}
              title={aiEnabled ? "Analizza" : "AI non attiva"}
              className="shrink-0 rounded-pill bg-indigo-500 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Analisi..." : "Analizza"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Chiudi"
            className="shrink-0 rounded-sm p-1 text-slate-500 hover:bg-brand-navy-deep hover:text-slate-300"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      )}

      {insight && (
        <div className="mt-3 space-y-2.5">
          <p className="text-[13px] font-medium leading-snug text-slate-100">{insight.headline}</p>
          {insight.observations.length > 0 && (
            <ul className="space-y-1 text-[12px] text-slate-300">
              {insight.observations.map((obs, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="mt-0.5 text-slate-500">·</span>
                  <span>{obs}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-start gap-2 rounded-sm border border-brand-teal/30 bg-brand-teal/10 px-3 py-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-teal">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
            <div className="text-[12px] text-slate-200">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-brand-teal">
                Prossima azione
              </span>
              {insight.next_action}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
