"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface BreakdownItem {
  operation: string;
  credits: number;
  count: number;
}

interface BreakdownResponse {
  total_credits: number;
  by_operation: BreakdownItem[];
}

// User-facing labels — never show model names (Haiku/Sonnet/Opus)
const OPERATION_LABEL: Record<string, string> = {
  chat_turn: "Chat con agent AI",
  chat_turn_tool_use: "Chat con azioni",
  chat_turn_planner: "Chat pianificazione campagne",
  template_generate: "Generazione template",
  template_improve: "Miglioramento template",
  template_compliance: "Controllo compliance",
  template_translate: "Traduzione template",
  personalize_message: "Personalizzazione messaggi",
  campaign_planner: "Pianificazione campagne",
};

const OPERATION_COLOR: Record<string, string> = {
  chat_turn: "bg-sky-500",
  chat_turn_tool_use: "bg-sky-400",
  chat_turn_planner: "bg-indigo-500",
  template_generate: "bg-brand-teal",
  template_improve: "bg-brand-teal",
  template_compliance: "bg-violet-500",
  template_translate: "bg-emerald-500",
  personalize_message: "bg-amber-500",
  campaign_planner: "bg-rose-500",
};

export function UsageBreakdown() {
  const [data, setData] = useState<BreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/billing/usage/breakdown")
      .then((r) => (r.ok ? r.json() : { total_credits: 0, by_operation: [] }))
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data) return null;

  if (data.total_credits === 0) {
    return (
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
        <h2 className="text-[15px] font-semibold text-slate-100">Consumo questo mese</h2>
        <p className="mt-2 text-[12.5px] text-slate-400">
          Nessuna operazione AI registrata questo mese. Usa l&apos;agent o gli strumenti AI
          sui template per vedere qui il dettaglio del consumo.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
      <div className="flex items-end justify-between">
        <h2 className="text-[15px] font-semibold text-slate-100">Consumo questo mese</h2>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Totale</div>
          <div className="text-[18px] font-bold text-slate-100">
            {data.total_credits.toFixed(1)} crediti
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {data.by_operation.map((item) => {
          const pct = (item.credits / data.total_credits) * 100;
          const label = OPERATION_LABEL[item.operation] || item.operation;
          const color = OPERATION_COLOR[item.operation] || "bg-slate-500";
          return (
            <div key={item.operation}>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span className="text-slate-200">{label}</span>
                <span className="text-slate-400">
                  <span className="text-slate-100 font-medium">{item.credits.toFixed(1)}</span>
                  <span className="mx-1.5 text-slate-600">·</span>
                  <span>{item.count} {item.count === 1 ? "volta" : "volte"}</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
