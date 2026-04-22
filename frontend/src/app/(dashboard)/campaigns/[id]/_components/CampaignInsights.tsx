"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Insight {
  summary: string;
  highlights: string[];
  improvements: string[];
  failure_diagnosis: string | null;
}

interface Props {
  campaignId: string;
  aiEnabled: boolean;
}

/**
 * Post-send insight card. Hidden until the user clicks "Analizza".
 * Costs 2 AI credits (Sonnet). Disabled when the agent isn't configured
 * or when the campaign hasn't sent any message yet (enforced server-side).
 */
export function CampaignInsights({ campaignId, aiEnabled }: Props) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/insights`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Analisi non disponibile.");
      setInsight(body as Insight);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-card border border-indigo-500/30 bg-indigo-500/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-indigo-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
              <path d="M19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
            </svg>
            Analisi AI
            <span className="rounded-pill bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
              2 crediti
            </span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-slate-400">
            {insight
              ? "Ragionamento Claude sulle statistiche di questa campagna"
              : "Clicca per ricevere osservazioni e suggerimenti concreti."}
          </div>
        </div>
        {!insight && (
          <button
            type="button"
            onClick={run}
            disabled={loading || !aiEnabled}
            title={aiEnabled ? "Avvia analisi" : "AI non attiva"}
            className="shrink-0 rounded-pill bg-indigo-500 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Analisi..." : "Analizza"}
          </button>
        )}
        {insight && (
          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="shrink-0 text-[11.5px] text-indigo-300 hover:text-indigo-200 disabled:opacity-40"
          >
            {loading ? "Rianalisi..." : "↻ Rianalizza"}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      )}

      {insight && (
        <div className="mt-4 space-y-3">
          <p className="text-[13px] leading-relaxed text-slate-100">{insight.summary}</p>

          {insight.highlights.length > 0 && (
            <div>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-emerald-400">
                Punti forti
              </div>
              <ul className="space-y-1 text-[12px] text-slate-300">
                {insight.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 text-emerald-400">✓</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {insight.improvements.length > 0 && (
            <div>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-indigo-300">
                Suggerimenti
              </div>
              <ul className="space-y-1 text-[12px] text-slate-300">
                {insight.improvements.map((imp, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 text-indigo-400">→</span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {insight.failure_diagnosis && (
            <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-amber-300">
                Diagnosi fallimenti
              </div>
              <p className="text-[12px] leading-relaxed text-amber-200/90">
                {insight.failure_diagnosis}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
