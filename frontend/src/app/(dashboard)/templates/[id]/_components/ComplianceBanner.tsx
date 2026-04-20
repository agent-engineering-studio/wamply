"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { ComplianceReport, RiskLevel } from "@/lib/templates/types";

interface Props {
  templateId: string;
  report: ComplianceReport | null | undefined;
  onUpdated: (report: ComplianceReport) => void;
}

const STYLES: Record<
  RiskLevel,
  { label: string; bg: string; text: string; ring: string; dot: string }
> = {
  low: {
    label: "Conforme",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    ring: "ring-emerald-500/30",
    dot: "bg-emerald-400",
  },
  medium: {
    label: "Attenzione",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    ring: "ring-amber-500/30",
    dot: "bg-amber-400",
  },
  high: {
    label: "Rischio alto",
    bg: "bg-red-500/10",
    text: "text-red-300",
    ring: "ring-red-500/30",
    dot: "bg-red-400",
  },
};

export function ComplianceBanner({ templateId, report, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/templates/${templateId}/compliance-check`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          res.status === 402
            ? "Limite mensile AI raggiunto o piano non abilitato."
            : (data.detail ?? `Errore ${res.status}`)
        );
        return;
      }
      onUpdated(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di rete");
    } finally {
      setLoading(false);
    }
  }

  if (!report) {
    return (
      <div className="flex items-center justify-between rounded-card border border-slate-800 bg-brand-navy-light p-3">
        <div className="text-[12.5px] text-slate-400">
          <span className="font-medium text-slate-100">Conformità</span> — non ancora verificata
        </div>
        <button
          type="button"
          onClick={runCheck}
          disabled={loading}
          className="rounded-pill border border-brand-teal/40 bg-brand-teal/10 px-3 py-1.5 text-[12px] font-medium text-brand-teal hover:bg-brand-teal/15 disabled:opacity-50"
        >
          {loading ? "Analisi…" : "Verifica conformità"}
        </button>
        {error && (
          <div className="ml-3 rounded-sm bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
            {error}
          </div>
        )}
      </div>
    );
  }

  const s = STYLES[report.risk_level];
  const pct = Math.round(report.score * 100);

  return (
    <div className={`rounded-card p-3 ring-1 ${s.bg} ${s.ring}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
          <div>
            <div className={`text-[13px] font-semibold ${s.text}`}>
              {s.label}{" "}
              <span className="text-slate-400">
                · {pct}% prob. approvazione
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              Verificato: {new Date(report.checked_at).toLocaleString("it-IT")}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={runCheck}
          disabled={loading}
          className="rounded-pill border border-slate-800 px-2.5 py-1 text-[11px] text-slate-300 hover:border-slate-700 hover:text-slate-100 disabled:opacity-50"
        >
          {loading ? "…" : "Ri-verifica"}
        </button>
      </div>

      {report.issues.length > 0 && (
        <ul className="mt-3 space-y-2">
          {report.issues.map((issue, i) => (
            <li
              key={i}
              className="rounded-sm border border-slate-800 bg-brand-navy-deep p-2 text-[12px]"
            >
              <div className="font-medium text-slate-100">"{issue.text}"</div>
              <div className="mt-0.5 text-slate-400">
                <span className="text-slate-500">Problema: </span>
                {issue.reason}
              </div>
              <div className="mt-0.5 text-brand-teal">
                <span className="text-slate-500">Suggerimento: </span>
                {issue.suggestion}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-2 rounded-sm bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
