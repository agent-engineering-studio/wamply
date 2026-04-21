"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface RevenueData {
  days: number;
  subscription: {
    mrr_cents: number;
    by_plan: {
      name: string;
      slug: string;
      subs: number;
      price_cents: number;
      total_cents: number;
    }[];
  };
  topup: {
    total_cents: number;
    purchases: number;
    buyers: number;
    credits_sold: number;
    by_pack: {
      pack_slug: string;
      purchases: number;
      total_cents: number;
      credits: number;
    }[];
  };
  heavy_buyers: {
    user_id: string;
    email: string;
    full_name: string | null;
    purchases: number;
    total_cents: number;
  }[];
}

const PACK_LABEL: Record<string, string> = {
  small: "100 crediti",
  medium: "500 crediti",
  large: "2.000 crediti",
  xl: "10.000 crediti",
};

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatNum(v: number): string {
  return v.toLocaleString("it-IT");
}

export function AIRevenueTab() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/admin/ai/revenue?days=${days}`)
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

  return (
    <div className="space-y-5">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] text-slate-400">Top-up degli ultimi:</span>
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

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">MRR (abbonamenti)</div>
          <div className="mt-1 text-[22px] font-semibold text-slate-100">
            {formatEur(data.subscription.mrr_cents)}
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">
            {data.subscription.by_plan.reduce((s, p) => s + p.subs, 0)} sottoscrizioni attive
          </div>
        </div>
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Top-up ({days}g)</div>
          <div className="mt-1 text-[22px] font-semibold text-slate-100">
            {formatEur(data.topup.total_cents)}
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">
            {data.topup.purchases} acquisti · {data.topup.buyers} utenti
          </div>
        </div>
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Crediti venduti</div>
          <div className="mt-1 text-[22px] font-semibold text-slate-100">
            {formatNum(data.topup.credits_sold)}
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">via top-up nel periodo</div>
        </div>
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Totale periodo</div>
          <div className="mt-1 text-[22px] font-semibold text-brand-teal">
            {formatEur(data.subscription.mrr_cents + data.topup.total_cents)}
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">MRR + top-up {days}g</div>
        </div>
      </div>

      {/* Sub MRR by plan + Topup by pack */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
          <h3 className="mb-3 text-[13px] font-semibold text-slate-100">
            MRR per piano (snapshot attuale)
          </h3>
          {data.subscription.by_plan.length === 0 ? (
            <div className="text-[11.5px] text-slate-500">Nessuna sottoscrizione attiva.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="text-left pb-2">Piano</th>
                  <th className="text-right pb-2">Subs</th>
                  <th className="text-right pb-2">Prezzo</th>
                  <th className="text-right pb-2">Tot /mese</th>
                </tr>
              </thead>
              <tbody>
                {data.subscription.by_plan.map((p) => (
                  <tr key={p.slug} className="border-t border-slate-800/50">
                    <td className="py-2 text-[12px] text-slate-100">{p.name}</td>
                    <td className="py-2 text-right text-[12px] text-slate-300">{p.subs}</td>
                    <td className="py-2 text-right text-[12px] text-slate-400">
                      {formatEur(p.price_cents)}
                    </td>
                    <td className="py-2 text-right text-[12px] font-medium text-slate-100">
                      {formatEur(p.total_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
          <h3 className="mb-3 text-[13px] font-semibold text-slate-100">Top-up per pacchetto</h3>
          {data.topup.by_pack.length === 0 ? (
            <div className="text-[11.5px] text-slate-500">
              Nessun acquisto top-up in questo periodo.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="text-left pb-2">Pacchetto</th>
                  <th className="text-right pb-2">Acquisti</th>
                  <th className="text-right pb-2">Crediti</th>
                  <th className="text-right pb-2">Totale</th>
                </tr>
              </thead>
              <tbody>
                {data.topup.by_pack.map((p) => (
                  <tr key={p.pack_slug} className="border-t border-slate-800/50">
                    <td className="py-2 text-[12px] text-slate-100">
                      {PACK_LABEL[p.pack_slug] || p.pack_slug}
                    </td>
                    <td className="py-2 text-right text-[12px] text-slate-300">
                      {formatNum(p.purchases)}
                    </td>
                    <td className="py-2 text-right text-[12px] text-slate-300">
                      {formatNum(p.credits)}
                    </td>
                    <td className="py-2 text-right text-[12px] font-medium text-slate-100">
                      {formatEur(p.total_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Heavy buyers — upgrade candidates */}
      {data.heavy_buyers.length > 0 && (
        <div className="rounded-card border border-amber-500/20 bg-amber-500/5 overflow-hidden">
          <div className="border-b border-amber-500/20 px-5 py-3">
            <h3 className="text-[13px] font-semibold text-amber-200">
              Candidati upgrade ({data.heavy_buyers.length})
            </h3>
            <p className="mt-0.5 text-[11.5px] text-amber-200/70">
              Utenti con 3+ acquisti top-up negli ultimi {days} giorni — probabilmente trarrebbero
              beneficio da un piano Enterprise.
            </p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-amber-500/20 bg-brand-navy-deep text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2 text-left">Utente</th>
                <th className="px-5 py-2 text-right">Acquisti</th>
                <th className="px-5 py-2 text-right">Spesa top-up</th>
              </tr>
            </thead>
            <tbody>
              {data.heavy_buyers.map((b) => (
                <tr key={b.user_id} className="border-b border-amber-500/10 last:border-0">
                  <td className="px-5 py-3">
                    <div className="text-[12.5px] text-slate-100">{b.full_name || b.email}</div>
                    <div className="text-[10.5px] text-slate-500">{b.email}</div>
                  </td>
                  <td className="px-5 py-3 text-right text-[12px] text-amber-200">
                    {b.purchases}×
                  </td>
                  <td className="px-5 py-3 text-right text-[12px] font-medium text-slate-100">
                    {formatEur(b.total_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
