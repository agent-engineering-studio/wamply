"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { FailureInsight } from "./_components/FailureInsight";

interface Message {
  id: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  campaign_id: string;
  campaign_name: string;
  contact_id: string;
  contact_name: string | null;
  contact_phone: string;
}

const STATUS_CONFIG: Record<string, { badge: string; label: string }> = {
  read: { badge: "bg-green-100 text-green-800", label: "Letto" },
  delivered: { badge: "bg-blue-100 text-blue-800", label: "Consegnato" },
  sent: { badge: "bg-gray-100 text-gray-600", label: "Inviato" },
  pending: { badge: "bg-amber-100 text-amber-800", label: "In coda" },
  failed: { badge: "bg-red-100 text-red-800", label: "Fallito" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}g`;
}

export default function HistoryPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failedCount, setFailedCount] = useState(0);
  const { status: agentStatus } = useAgentStatus();
  const aiEnabled = !!agentStatus?.active;

  const reload = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (filter) params.set("status", filter);
    apiFetch(`/messages?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setMessages(d.messages || []);
        setTotal(d.total || 0);
      })
      .finally(() => setLoading(false));
  }, [filter, page]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Separate lightweight call to know failed count for the insight CTA
  useEffect(() => {
    apiFetch(`/messages?status=failed&page=1`)
      .then((r) => r.json())
      .then((d) => setFailedCount(d.total || 0))
      .catch(() => {});
  }, []);

  const filters: Array<{ key: string | null; label: string }> = [
    { key: null, label: "Tutti" },
    { key: "sent", label: "Inviati" },
    { key: "delivered", label: "Consegnati" },
    { key: "read", label: "Letti" },
    { key: "failed", label: "Falliti" },
  ];

  return (
    <>
      <h1 className="mb-1 text-[15px] font-semibold text-slate-100">Storico messaggi</h1>
      <p className="mb-4 text-[11px] text-slate-400">
        {total} {total === 1 ? "messaggio" : "messaggi"} totali
      </p>

      <FailureInsight aiEnabled={aiEnabled} failedCount={failedCount} />

      <div className="mb-4 flex gap-1.5">
        {filters.map((f) => (
          <button
            type="button"
            key={f.key ?? "all"}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={`rounded-pill px-3 py-1 text-[11px] font-medium ${filter === f.key ? "bg-green-100 text-green-800" : "bg-slate-800 text-slate-400"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse rounded-card bg-brand-navy-light p-8 text-[12.5px] text-slate-500">
          Caricamento...
        </div>
      ) : messages.length === 0 ? (
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-10 text-center">
          <h2 className="mb-1 text-[14px] font-semibold text-slate-100">
            {filter ? "Nessun messaggio in questo stato" : "Nessun messaggio ancora"}
          </h2>
          <p className="text-[12px] text-slate-400">
            {filter
              ? "Prova a rimuovere il filtro."
              : "Lancia una campagna per iniziare a vedere lo storico qui."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-slate-800 bg-brand-navy-light shadow-card">
          {messages.map((m) => {
            const nameOrPhone = m.contact_name || m.contact_phone;
            const initials = nameOrPhone.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "??";
            const config = STATUS_CONFIG[m.status] || STATUS_CONFIG.sent;
            return (
              <div key={m.id} className="flex items-center gap-3 border-b border-slate-800/50 px-4 py-2.5 last:border-0 hover:bg-brand-navy-deep">
                <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-brand-teal/15 text-[12px] font-semibold text-brand-teal">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-slate-100">
                    {m.contact_name || "Senza nome"}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">{m.contact_phone}</div>
                  {m.status === "failed" && m.error && (
                    <div className="mt-0.5 truncate font-mono text-[10.5px] text-rose-400" title={m.error}>
                      {m.error}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="truncate text-[11px] text-slate-400">{m.campaign_name}</div>
                  <span className={`mt-0.5 inline-block rounded-pill px-2 py-0.5 text-[10px] font-medium ${config.badge}`}>
                    {config.label}
                  </span>
                </div>
                <div className="w-12 text-right text-[11px] text-slate-500">
                  {relativeTime(m.sent_at || m.created_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {total > 50 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded-sm border border-slate-700 px-3 py-1.5 text-[12px] font-medium text-slate-200 hover:border-brand-teal/50 hover:bg-brand-navy-deep hover:text-brand-teal disabled:opacity-30 disabled:hover:border-slate-700 disabled:hover:bg-transparent disabled:hover:text-slate-200"
          >
            ← Prec
          </button>
          <span className="text-[12px] text-slate-400">
            Pagina {page} di {Math.ceil(total / 50)}
          </span>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page >= Math.ceil(total / 50)}
            className="rounded-sm border border-slate-700 px-3 py-1.5 text-[12px] font-medium text-slate-200 hover:border-brand-teal/50 hover:bg-brand-navy-deep hover:text-brand-teal disabled:opacity-30 disabled:hover:border-slate-700 disabled:hover:bg-transparent disabled:hover:text-slate-200"
          >
            Succ →
          </button>
        </div>
      )}
    </>
  );
}
