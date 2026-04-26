"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Stats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

interface RecentMessage {
  id: string;
  contact_name: string | null;
  phone: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  error: string | null;
}

const STATUS_DOT: Record<string, { color: string; label: string }> = {
  pending:   { color: "bg-slate-500",    label: "In attesa" },
  sent:      { color: "bg-sky-400",      label: "Inviato" },
  delivered: { color: "bg-emerald-400",  label: "Consegnato" },
  read:      { color: "bg-emerald-300",  label: "Letto" },
  failed:    { color: "bg-rose-400",     label: "Fallito" },
};

function latestTs(m: RecentMessage): string | null {
  return m.read_at ?? m.delivered_at ?? m.sent_at;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function SendProgress({
  stats,
  campaignId,
  startedAt,
}: {
  stats: Stats;
  campaignId: string;
  startedAt: string | null;
}) {
  const { total, sent, delivered, read, failed } = stats;
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  const [messages, setMessages] = useState<RecentMessage[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function fetchRecent() {
      try {
        const r = await apiFetch(
          `/campaigns/${campaignId}/messages?page=1&page_size=10`
        );
        if (!r.ok) return;
        const d = await r.json();
        setMessages(d.messages ?? []);
      } catch {}
    }
    fetchRecent();
    timerRef.current = setInterval(fetchRecent, 3000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [campaignId]);

  // rate & ETA
  const elapsedMin = startedAt
    ? Math.max(1, (Date.now() - new Date(startedAt).getTime()) / 60_000)
    : null;
  const rate = elapsedMin && sent > 0 ? sent / elapsedMin : null;
  const remaining = total - sent;
  const etaMin = rate && remaining > 0 ? Math.ceil(remaining / rate) : null;

  const counters = [
    { label: "Inviati",    value: sent,      color: "text-slate-100" },
    { label: "Consegnati", value: delivered,  color: "text-emerald-400" },
    { label: "Letti",      value: read,       color: "text-emerald-300" },
    { label: "Falliti",    value: failed,     color: failed > 0 ? "text-rose-400" : "text-slate-500" },
  ];

  return (
    <div className="space-y-4">
      {/* Header + progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[13px]">
          <span className="flex items-center gap-2 font-medium text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className="h-3.5 w-3.5 animate-spin text-brand-teal">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Invio in corso…
          </span>
          <span className="tabular-nums text-slate-400">
            {sent} / {total} ({pct}%)
          </span>
        </div>

        <div
          className="h-2 w-full overflow-hidden rounded-full bg-slate-700"
          style={{ "--pct": `${pct}%` } as React.CSSProperties}
        >
          <div className="h-full w-(--pct) rounded-full bg-brand-teal transition-all duration-700" />
        </div>

        {/* Rate + ETA */}
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          {rate !== null && (
            <span>~{rate < 1 ? "<1" : Math.round(rate)} msg/min</span>
          )}
          {etaMin !== null && (
            <>
              <span>·</span>
              <span>ETA ~{etaMin} min</span>
            </>
          )}
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-4 gap-2">
        {counters.map((c) => (
          <div key={c.label} className="rounded-sm bg-slate-800/60 py-2 text-center">
            <div className={`text-[18px] font-semibold tabular-nums ${c.color}`}>{c.value}</div>
            <div className="mt-0.5 text-[10px] text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Activity log */}
      {messages.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-slate-600">
            Attività recente
          </p>
          <div className="divide-y divide-slate-800 rounded-md border border-slate-800">
            {messages.map((m) => {
              const cfg = STATUS_DOT[m.status] ?? STATUS_DOT.pending;
              const ts = latestTs(m);
              return (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                  <span className="w-17.5 shrink-0 tabular-nums text-slate-600">{fmtTime(ts)}</span>
                  <span className="flex-1 truncate text-slate-300">
                    {m.contact_name || m.phone}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.color}`} />
                    <span className="text-slate-400">{cfg.label}</span>
                  </span>
                  {m.error && (
                    <span className="ml-1 max-w-30 truncate text-[10.5px] text-rose-400" title={m.error}>
                      {m.error}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {messages.length === 0 && (
        <p className="text-[11.5px] text-slate-600">
          In attesa dei primi invii…
        </p>
      )}
    </div>
  );
}
