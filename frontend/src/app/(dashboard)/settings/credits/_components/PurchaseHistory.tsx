"use client";

import type { Purchase } from "./CreditsClient";

const PACK_LABEL: Record<string, string> = {
  small: "100 crediti",
  medium: "500 crediti",
  large: "2.000 crediti",
  xl: "10.000 crediti",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending:   { label: "In attesa",  className: "bg-amber-500/15 text-amber-300" },
  completed: { label: "Completato", className: "bg-emerald-500/15 text-emerald-300" },
  failed:    { label: "Fallito",    className: "bg-rose-500/15 text-rose-300" },
  refunded:  { label: "Rimborsato", className: "bg-slate-500/15 text-slate-300" },
};

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PurchaseHistory({ history }: { history: Purchase[] }) {
  return (
    <div className="rounded-card border border-slate-800 bg-brand-navy-light overflow-hidden">
      <div className="border-b border-slate-800 px-5 py-3">
        <h2 className="text-[15px] font-semibold text-slate-100">Storico acquisti</h2>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-800 bg-brand-navy-deep text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            <th className="px-5 py-2 text-left">Data</th>
            <th className="px-5 py-2 text-left">Pacchetto</th>
            <th className="px-5 py-2 text-left">Importo</th>
            <th className="px-5 py-2 text-left">Stato</th>
          </tr>
        </thead>
        <tbody>
          {history.map((p) => {
            const meta = STATUS_META[p.status] || STATUS_META.pending;
            return (
              <tr key={p.id} className="border-b border-slate-800/50 last:border-0">
                <td className="px-5 py-3 text-[12px] text-slate-300">
                  {formatDate(p.completed_at || p.created_at)}
                </td>
                <td className="px-5 py-3 text-[12.5px] text-slate-100">
                  {PACK_LABEL[p.pack_slug] || p.pack_slug}
                </td>
                <td className="px-5 py-3 text-[12.5px] text-slate-100">
                  {formatPrice(p.amount_cents)}
                </td>
                <td className="px-5 py-3">
                  <span className={`rounded-pill px-2 py-0.5 text-[10.5px] font-medium ${meta.className}`}>
                    {meta.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
