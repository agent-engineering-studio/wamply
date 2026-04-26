"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Message {
  id: string;
  contact_name: string | null;
  phone: string;
  status: string;
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

interface Props {
  campaignId: string;
  campaignStatus: string;
  statusFilter: string;
  onFilterChange: (filter: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:   { label: "In attesa",   className: "bg-slate-700 text-slate-300" },
  sent:      { label: "Inviato",     className: "bg-sky-500/20 text-sky-300" },
  delivered: { label: "Consegnato",  className: "bg-emerald-500/20 text-emerald-300" },
  read:      { label: "Letto",       className: "bg-emerald-500/30 text-emerald-200" },
  failed:    { label: "Fallito",     className: "bg-rose-500/20 text-rose-300" },
};

const FILTER_CHIPS = [
  { value: "",          label: "Tutti" },
  { value: "sent",      label: "Inviati" },
  { value: "delivered", label: "Consegnati" },
  { value: "read",      label: "Letti" },
  { value: "failed",    label: "Falliti" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const PAGE_SIZE = 50;

export function MessagesTab({ campaignId, campaignStatus, statusFilter, onFilterChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  async function load(p: number, s: string) {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
      if (s) qs.set("status", s);
      const r = await apiFetch(`/campaigns/${campaignId}/messages?${qs}`);
      if (!r.ok) return;
      const data = await r.json();
      setMessages(data.messages ?? []);
      setTotal(data.total ?? 0);
      setInitialLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  // Reset to page 1 when filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    load(page, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const noMessages = initialLoaded && total === 0 && statusFilter === "";

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => onFilterChange(chip.value)}
            className={`rounded-pill px-3 py-1 text-[12px] font-medium transition-colors ${
              statusFilter === chip.value
                ? "bg-brand-teal text-white"
                : "border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
          >
            {chip.label}
          </button>
        ))}
        {total > 0 && (
          <span className="ml-auto text-[12px] text-slate-500">{total} messaggi</span>
        )}
      </div>

      {/* Empty state — no messages at all */}
      {noMessages && (
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-8 text-center text-[12px] text-slate-500">
          {campaignStatus === "failed"
            ? "La campagna è terminata senza inviare messaggi."
            : "Nessun messaggio ancora."}
        </div>
      )}

      {/* Message table */}
      {!noMessages && (
        <>
          <div className="overflow-hidden rounded-card border border-slate-800">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-left text-[11px] text-slate-400">
                  <th className="px-3 py-2.5 font-medium">Contatto</th>
                  <th className="px-3 py-2.5 font-medium">Telefono</th>
                  <th className="px-3 py-2.5 font-medium">Stato</th>
                  <th className="px-3 py-2.5 font-medium">Inviato</th>
                  <th className="px-3 py-2.5 font-medium">Consegnato</th>
                  <th className="px-3 py-2.5 font-medium">Letto</th>
                  <th className="px-3 py-2.5 font-medium">Errore</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">Caricamento…</td>
                  </tr>
                )}
                {!loading && messages.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                      Nessun messaggio con questo stato
                    </td>
                  </tr>
                )}
                {!loading && messages.map((m) => {
                  const cfg = STATUS_CONFIG[m.status] ?? { label: m.status, className: "bg-slate-700 text-slate-300" };
                  return (
                    <tr key={m.id} className="bg-brand-navy-light transition-colors hover:bg-slate-800/30">
                      <td className="px-3 py-2.5 text-slate-200">{m.contact_name || "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-400">{m.phone}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-pill px-2 py-0.5 text-[10.5px] font-medium ${cfg.className}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">{fmtDate(m.sent_at)}</td>
                      <td className="px-3 py-2.5 text-slate-400">{fmtDate(m.delivered_at)}</td>
                      <td className="px-3 py-2.5 text-slate-400">{fmtDate(m.read_at)}</td>
                      <td className="max-w-45 truncate px-3 py-2.5 text-rose-400" title={m.error ?? ""}>
                        {m.error || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-[12px] text-slate-400">
              <span>Pagina {page} di {totalPages}</span>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="rounded-sm border border-slate-700 px-3 py-1 hover:border-slate-500 disabled:opacity-40">
                  ← Prec
                </button>
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="rounded-sm border border-slate-700 px-3 py-1 hover:border-slate-500 disabled:opacity-40">
                  Succ →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
