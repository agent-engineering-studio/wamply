"use client";

import { useMemo, useState } from "react";

export interface AdminCampaign {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "running" | "paused" | "completed" | "failed";
  stats: { total: number; sent: number; delivered: number; read: number; failed: number };
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  user: { email: string; full_name: string | null } | null;
  template: { name: string } | null;
}

type StatusFilter = "all" | AdminCampaign["status"];
type SortKey = "created" | "started" | "total" | "delivery" | "read" | "failure";

const STATUS_META: Record<AdminCampaign["status"], { label: string; className: string }> = {
  draft:     { label: "Bozza",      className: "bg-slate-700/40 text-slate-300" },
  scheduled: { label: "Schedulata", className: "bg-purple-500/15 text-purple-300" },
  running:   { label: "In corso",   className: "bg-amber-500/15 text-amber-300" },
  paused:    { label: "In pausa",   className: "bg-blue-500/15 text-blue-300" },
  completed: { label: "Completata", className: "bg-emerald-500/15 text-emerald-300" },
  failed:    { label: "Fallita",    className: "bg-rose-500/15 text-rose-300" },
};

function pct(num: number, den: number) {
  if (den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function formatPct(value: number) {
  return `${value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
}

function formatDuration(startISO: string | null, endISO: string | null) {
  if (!startISO) return "—";
  const start = new Date(startISO).getTime();
  const end = endISO ? new Date(endISO).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const hrem = hours % 24;
  return hrem ? `${days}d ${hrem}h` : `${days}d`;
}

function formatThroughput(sent: number, startISO: string | null, endISO: string | null) {
  if (!startISO || sent <= 0) return "—";
  const start = new Date(startISO).getTime();
  const end = endISO ? new Date(endISO).getTime() : Date.now();
  const mins = Math.max(1, (end - start) / 60000);
  const rate = sent / mins;
  if (rate < 1) return `${rate.toFixed(2)}/min`;
  if (rate < 100) return `${rate.toFixed(1)}/min`;
  return `${Math.round(rate)}/min`;
}

export function CampaignsTable({ campaigns }: { campaigns: AdminCampaign[] }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDesc, setSortDesc] = useState(true);

  const enriched = useMemo(() => {
    return campaigns.map((c) => {
      const raw = c.stats ?? {};
      const s = {
        total: Number(raw.total) || 0,
        sent: Number(raw.sent) || 0,
        delivered: Number(raw.delivered) || 0,
        read: Number(raw.read) || 0,
        failed: Number(raw.failed) || 0,
      };
      return {
        ...c,
        stats: s,
        _progress: pct(s.sent, s.total),
        _delivery: pct(s.delivered, s.sent),
        _read: pct(s.read, s.delivered),
        _failure: pct(s.failed, s.total),
      };
    });
  }, [campaigns]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: campaigns.length };
    for (const c of campaigns) counts[c.status] = (counts[c.status] ?? 0) + 1;
    return counts;
  }, [campaigns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (!q) return true;
      const owner = `${c.user?.full_name ?? ""} ${c.user?.email ?? ""}`.toLowerCase();
      return c.name.toLowerCase().includes(q) || owner.includes(q);
    });
  }, [enriched, status, query]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDesc ? -1 : 1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "created":
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        case "started": {
          const av = a.started_at ? new Date(a.started_at).getTime() : 0;
          const bv = b.started_at ? new Date(b.started_at).getTime() : 0;
          return dir * (av - bv);
        }
        case "total":    return dir * (a.stats.total - b.stats.total);
        case "delivery": return dir * (a._delivery - b._delivery);
        case "read":     return dir * (a._read - b._read);
        case "failure":  return dir * (a._failure - b._failure);
      }
    });
    return arr;
  }, [filtered, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const statusTabs: StatusFilter[] = ["all", "running", "scheduled", "completed", "paused", "draft", "failed"];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-[10px] border border-slate-800 bg-brand-navy-light p-[3px]">
          {statusTabs.map((s) => {
            const label = s === "all" ? "Tutte" : STATUS_META[s as AdminCampaign["status"]].label;
            const count = statusCounts[s] ?? 0;
            const active = status === s;
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-sm px-2.5 py-1 text-[11.5px] font-medium transition-colors ${active ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-100"}`}
              >
                {label} <span className="ml-0.5 text-slate-500">{count}</span>
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome o utente..."
          className="ml-auto w-64 rounded-sm border border-slate-800 bg-brand-navy-light px-3 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
        />
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-8 text-center text-[12.5px] text-slate-500">
          Nessuna campagna corrisponde ai filtri.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-slate-800 bg-brand-navy-light shadow-card">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-slate-800 bg-brand-navy-deep text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-3.5 py-2">Campagna</th>
                <th className="px-3.5 py-2">Stato</th>
                <Th onClick={() => toggleSort("total")}      active={sortKey === "total"}    desc={sortDesc}>Contatti</Th>
                <th className="px-3.5 py-2">Progresso</th>
                <Th onClick={() => toggleSort("delivery")}   active={sortKey === "delivery"} desc={sortDesc}>Consegna</Th>
                <Th onClick={() => toggleSort("read")}       active={sortKey === "read"}     desc={sortDesc}>Lettura</Th>
                <Th onClick={() => toggleSort("failure")}    active={sortKey === "failure"}  desc={sortDesc}>Errori</Th>
                <th className="px-3.5 py-2">Durata</th>
                <th className="px-3.5 py-2">Throughput</th>
                <Th onClick={() => toggleSort("started")}    active={sortKey === "started"}  desc={sortDesc}>Avviata</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const s = c.stats;
                const meta = STATUS_META[c.status];
                const ownerName = c.user?.full_name || c.user?.email || "—";
                return (
                  <tr key={c.id} className="border-b border-slate-800/50 align-top last:border-0 hover:bg-brand-navy-deep/60">
                    <td className="px-3.5 py-3">
                      <div className="text-[13px] font-medium text-slate-100">{c.name}</div>
                      <div className="text-[11px] text-slate-400">{ownerName}</div>
                      {c.template?.name && (
                        <div className="mt-0.5 text-[10.5px] text-slate-500">Template: {c.template.name}</div>
                      )}
                    </td>
                    <td className="px-3.5 py-3">
                      <span className={`inline-block rounded-pill px-2 py-0.5 text-[10.5px] font-medium ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-[13px] font-medium text-slate-100">
                      {s.total.toLocaleString("it-IT")}
                    </td>
                    <td className="px-3.5 py-3 min-w-[150px]">
                      <StackedBar total={s.total} delivered={s.delivered} read={s.read} failed={s.failed} sent={s.sent} />
                      <div className="mt-1 text-[10.5px] text-slate-400">
                        {s.sent.toLocaleString("it-IT")}/{s.total.toLocaleString("it-IT")} inviati ({formatPct(c._progress)})
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="text-[13px] font-medium text-slate-100">{formatPct(c._delivery)}</div>
                      <div className="text-[10.5px] text-slate-400">{s.delivered.toLocaleString("it-IT")}</div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="text-[13px] font-medium text-slate-100">{formatPct(c._read)}</div>
                      <div className="text-[10.5px] text-slate-400">{s.read.toLocaleString("it-IT")}</div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className={`text-[13px] font-medium ${c._failure > 5 ? "text-rose-300" : "text-slate-100"}`}>
                        {formatPct(c._failure)}
                      </div>
                      <div className="text-[10.5px] text-slate-400">{s.failed.toLocaleString("it-IT")}</div>
                    </td>
                    <td className="px-3.5 py-3 text-[12px] text-slate-300">
                      {formatDuration(c.started_at, c.completed_at)}
                    </td>
                    <td className="px-3.5 py-3 text-[12px] text-slate-300">
                      {formatThroughput(s.sent, c.started_at, c.completed_at)}
                    </td>
                    <td className="px-3.5 py-3 text-[11px] text-slate-400">
                      {c.started_at
                        ? new Date(c.started_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, onClick, active, desc }: { children: React.ReactNode; onClick: () => void; active: boolean; desc: boolean }) {
  return (
    <th className="px-3.5 py-2">
      <button onClick={onClick} className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200">
        {children}
        <span className={`text-[9px] ${active ? "text-brand-teal" : "text-slate-600"}`}>{active ? (desc ? "▼" : "▲") : "▾"}</span>
      </button>
    </th>
  );
}

function StackedBar({ total, delivered, read, failed, sent }: { total: number; delivered: number; read: number; failed: number; sent: number }) {
  if (total <= 0) {
    return <div className="h-1.5 rounded-full bg-slate-800" />;
  }
  const readPct     = pct(read, total);
  const deliveredPct = pct(Math.max(0, delivered - read), total);
  const sentPct     = pct(Math.max(0, sent - delivered), total);
  const failedPct   = pct(failed, total);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800" title={`Letti ${read} · Consegnati ${delivered} · Inviati ${sent} · Falliti ${failed} su ${total}`}>
      <div className="bg-emerald-400" style={{ width: `${readPct}%` }} />
      <div className="bg-brand-teal" style={{ width: `${deliveredPct}%` }} />
      <div className="bg-sky-500/70" style={{ width: `${sentPct}%` }} />
      <div className="bg-rose-500/70" style={{ width: `${failedPct}%` }} />
    </div>
  );
}
