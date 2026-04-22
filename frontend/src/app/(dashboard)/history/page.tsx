"use client";

import { useState } from "react";

interface HistoryItem {
  id: string;
  name: string;
  phone: string;
  campaign: string;
  status: "sent" | "delivered" | "read" | "failed";
  time: string;
}

const STATUS_CONFIG: Record<string, { badge: string; label: string }> = {
  read: { badge: "bg-green-100 text-green-800", label: "Letto" },
  delivered: { badge: "bg-blue-100 text-blue-800", label: "Consegnato" },
  sent: { badge: "bg-gray-100 text-gray-600", label: "Inviato" },
  failed: { badge: "bg-red-100 text-red-800", label: "Fallito" },
};

const DEMO_HISTORY: HistoryItem[] = [
  { id: "1", name: "Marco Bianchi", phone: "+39 333 1234567", campaign: "Promo Estiva", status: "read", time: "2 min" },
  { id: "2", name: "Laura Verdi", phone: "+39 340 7654321", campaign: "Promo Estiva", status: "delivered", time: "5 min" },
  { id: "3", name: "Giuseppe Neri", phone: "+39 328 9876543", campaign: "Newsletter", status: "read", time: "12 min" },
  { id: "4", name: "Anna Russo", phone: "+39 339 1122334", campaign: "Newsletter", status: "failed", time: "15 min" },
  { id: "5", name: "Paolo Conte", phone: "+39 347 5566778", campaign: "Promo Estiva", status: "sent", time: "20 min" },
];

export default function HistoryPage() {
  const [filter, setFilter] = useState<string | null>(null);

  const filtered = filter ? DEMO_HISTORY.filter((h) => h.status === filter) : DEMO_HISTORY;

  return (
    <>
      <h1 className="mb-1 text-[15px] font-semibold text-slate-100">Storico messaggi</h1>
      <p className="mb-4 text-[11px] text-slate-400">Tutti i messaggi inviati</p>

      <div className="mb-5 flex items-start gap-3 rounded-card border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-amber-300">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div className="text-[12px] text-amber-200/90">
          <strong className="text-amber-100">Anteprima demo</strong> — i messaggi mostrati sono esempi.
          Il feed reale in tempo reale arriverà nella prossima release, con analisi AI dei pattern di
          fallimento e suggerimenti per migliorare consegna e lettura.
        </div>
      </div>

      <div className="mb-4 flex gap-1.5">
        {[null, "sent", "delivered", "read", "failed"].map((s) => (
          <button type="button" key={s ?? "all"} onClick={() => setFilter(s)}
            className={`rounded-pill px-3 py-1 text-[11px] font-medium ${filter === s ? "bg-green-100 text-green-800" : "bg-slate-800 text-slate-400"}`}>
            {s ? STATUS_CONFIG[s]?.label || s : "Tutti"}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-slate-800 bg-brand-navy-light shadow-card">
        {filtered.map((h) => {
          const initials = h.name.split(" ").map((w) => w[0]).join("").slice(0, 2);
          const config = STATUS_CONFIG[h.status];
          return (
            <div key={h.id} className="flex items-center gap-3 border-b border-slate-800/50 px-4 py-2.5 last:border-0 hover:bg-brand-navy-deep">
              <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full bg-brand-teal/15 text-[12px] font-semibold text-brand-teal">
                {initials}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-slate-100">{h.name}</div>
                <div className="font-mono text-[11px] text-slate-400">{h.phone}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-400">{h.campaign}</div>
                <span className={`mt-0.5 inline-block rounded-pill px-2 py-0.5 text-[10px] font-medium ${config.badge}`}>
                  {config.label}
                </span>
              </div>
              <div className="w-10 text-right text-[11px] text-slate-500">{h.time}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
