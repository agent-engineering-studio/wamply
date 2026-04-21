"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface CostsData {
  days: number;
  system_key: {
    total_credits: number;
    total_cost_usd: number;
    total_tokens_in: number;
    total_tokens_out: number;
    total_calls: number;
    active_users: number;
  };
  byok: {
    total_calls: number;
    active_users: number;
    tokens_in: number;
    tokens_out: number;
  };
  by_model: { model: string; calls: number; credits: number; cost_usd: number }[];
  by_operation: { operation: string; calls: number; credits: number; cost_usd: number }[];
  timeline: { day: string; credits: number; cost_usd: number }[];
  top_users: {
    user_id: string;
    email: string;
    full_name: string | null;
    calls: number;
    credits: number;
    cost_usd: number;
  }[];
}

const OPERATION_LABEL: Record<string, string> = {
  chat_turn: "Chat agent",
  chat_turn_tool_use: "Chat con azioni",
  chat_turn_planner: "Chat pianificazione",
  template_generate: "Genera template",
  template_improve: "Migliora template",
  template_compliance: "Compliance check",
  template_translate: "Traduzione",
  personalize_message: "Personalizzazione",
  campaign_planner: "Planner campagne",
};

const MODEL_LABEL: Record<string, string> = {
  haiku: "Haiku (veloce)",
  sonnet: "Sonnet (default)",
  opus: "Opus (profondo)",
};

function formatUsd(v: number): string {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatNum(v: number): string {
  return v.toLocaleString("it-IT");
}

export function AICostsTab() {
  const [data, setData] = useState<CostsData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/admin/ai/costs?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  if (loading || !data) {
    return <div className="animate-pulse text-slate-500">Caricamento...</div>;
  }

  const maxTimeline = Math.max(1, ...data.timeline.map((t) => t.cost_usd));

  return (
    <div className="space-y-5">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] text-slate-400">Periodo:</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-pill px-3 py-1 text-[11.5px] font-medium ${
              days === d
                ? "bg-brand-teal text-white"
                : "border border-slate-800 text-slate-400 hover:text-slate-100"
            }`}
          >
            {d} giorni
          </button>
        ))}
      </div>

      {/* KPIs system_key */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Costo Anthropic</div>
          <div className="mt-1 text-[22px] font-semibold text-slate-100">
            {formatUsd(data.system_key.total_cost_usd)}
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">
            {formatNum(data.system_key.total_tokens_in + data.system_key.total_tokens_out)} token
          </div>
        </div>
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Crediti consumati</div>
          <div className="mt-1 text-[22px] font-semibold text-slate-100">
            {formatNum(Math.round(data.system_key.total_credits))}
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">system key</div>
        </div>
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Chiamate AI</div>
          <div className="mt-1 text-[22px] font-semibold text-slate-100">
            {formatNum(data.system_key.total_calls)}
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">
            da {data.system_key.active_users} utenti
          </div>
        </div>
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">BYOK (loro costo)</div>
          <div className="mt-1 text-[22px] font-semibold text-slate-100">
            {formatNum(data.byok.total_calls)}
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">
            {data.byok.active_users} utenti
          </div>
        </div>
      </div>

      {/* Timeline chart */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-slate-100">Costo giornaliero</h3>
          <div className="text-[10.5px] text-slate-500">USD per giorno</div>
        </div>
        {data.timeline.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-slate-500">
            Nessun dato per questo periodo.
          </div>
        ) : (
          <div className="flex h-40 items-end gap-[3px]">
            {data.timeline.map((t) => {
              const h = (t.cost_usd / maxTimeline) * 100;
              const dayStr = new Date(t.day).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "2-digit",
              });
              return (
                <div
                  key={t.day}
                  className="group flex flex-1 flex-col items-center gap-1"
                  title={`${dayStr}: ${formatUsd(t.cost_usd)} · ${Math.round(t.credits)} crediti`}
                >
                  <div
                    className="w-full rounded-sm bg-brand-teal transition-all group-hover:bg-brand-teal-dark"
                    style={{ height: `${Math.max(2, h)}%` }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* By model + By operation side-by-side */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
          <h3 className="mb-3 text-[13px] font-semibold text-slate-100">Per modello</h3>
          {data.by_model.length === 0 ? (
            <div className="text-[11.5px] text-slate-500">Nessun dato.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="text-left pb-2">Modello</th>
                  <th className="text-right pb-2">Chiamate</th>
                  <th className="text-right pb-2">Costo USD</th>
                </tr>
              </thead>
              <tbody>
                {data.by_model.map((m) => (
                  <tr key={m.model} className="border-t border-slate-800/50">
                    <td className="py-2 text-[12px] text-slate-200">
                      {MODEL_LABEL[m.model] || m.model}
                    </td>
                    <td className="py-2 text-right text-[12px] text-slate-300">{formatNum(m.calls)}</td>
                    <td className="py-2 text-right text-[12px] font-medium text-slate-100">
                      {formatUsd(m.cost_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
          <h3 className="mb-3 text-[13px] font-semibold text-slate-100">Per operazione</h3>
          {data.by_operation.length === 0 ? (
            <div className="text-[11.5px] text-slate-500">Nessun dato.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="text-left pb-2">Operazione</th>
                  <th className="text-right pb-2">Crediti</th>
                  <th className="text-right pb-2">Costo USD</th>
                </tr>
              </thead>
              <tbody>
                {data.by_operation.map((o) => (
                  <tr key={o.operation} className="border-t border-slate-800/50">
                    <td className="py-2 text-[12px] text-slate-200">
                      {OPERATION_LABEL[o.operation] || o.operation}
                    </td>
                    <td className="py-2 text-right text-[12px] text-slate-300">
                      {formatNum(Math.round(o.credits))}
                    </td>
                    <td className="py-2 text-right text-[12px] font-medium text-slate-100">
                      {formatUsd(o.cost_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Top users */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light overflow-hidden">
        <div className="border-b border-slate-800 px-5 py-3">
          <h3 className="text-[13px] font-semibold text-slate-100">Top 10 utenti per consumo</h3>
        </div>
        {data.top_users.length === 0 ? (
          <div className="p-5 text-[11.5px] text-slate-500">Nessun utente consumatore nel periodo.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-brand-navy-deep text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2 text-left">Utente</th>
                <th className="px-5 py-2 text-right">Chiamate</th>
                <th className="px-5 py-2 text-right">Crediti</th>
                <th className="px-5 py-2 text-right">Costo</th>
              </tr>
            </thead>
            <tbody>
              {data.top_users.map((u) => (
                <tr key={u.user_id} className="border-b border-slate-800/50 last:border-0">
                  <td className="px-5 py-3">
                    <div className="text-[12.5px] text-slate-100">{u.full_name || u.email}</div>
                    <div className="text-[10.5px] text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-5 py-3 text-right text-[12px] text-slate-300">{formatNum(u.calls)}</td>
                  <td className="px-5 py-3 text-right text-[12px] text-slate-100">
                    {formatNum(Math.round(u.credits))}
                  </td>
                  <td className="px-5 py-3 text-right text-[12px] font-medium text-slate-100">
                    {formatUsd(u.cost_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
