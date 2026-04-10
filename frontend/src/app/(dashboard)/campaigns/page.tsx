"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  status: string;
  stats: { total: number; sent: number; delivered: number; read: number; failed: number };
  started_at: string | null;
  created_at: string;
}

const STATUS_BADGES: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  running: "bg-amber-100 text-amber-800",
  scheduled: "bg-purple-100 text-purple-800",
  draft: "bg-gray-100 text-gray-600",
  failed: "bg-red-100 text-red-800",
};

const LABELS: Record<string, string> = {
  completed: "completato", running: "in corso", scheduled: "schedulato", draft: "bozza", failed: "fallito",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = filter ? `/api/campaigns?status=${filter}` : "/api/campaigns";
    fetch(url).then((r) => r.json()).then((d) => { setCampaigns(d.campaigns || []); setLoading(false); });
  }, [filter]);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-brand-ink">Campagne</h1>
          <p className="text-[11px] text-brand-ink-60">{campaigns.length} campagne totali</p>
        </div>
        <Link href="/campaigns/new" className="rounded-sm bg-brand-green px-4 py-2 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(37,211,102,.3)] hover:bg-brand-green-dark">
          + Nuova
        </Link>
      </div>

      <div className="mb-5 flex gap-1.5">
        {[null, "running", "completed", "scheduled", "draft"].map((s) => (
          <button key={s ?? "all"} onClick={() => setFilter(s)}
            className={`rounded-pill px-3 py-1 text-[11px] font-medium ${filter === s ? "bg-green-100 text-green-800" : "bg-brand-ink-10 text-brand-ink-60 hover:bg-brand-ink-10"}`}>
            {s ? LABELS[s] || s : "Tutte"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse text-brand-ink-30">Caricamento...</div>
      ) : (
        <div className="space-y-2.5">
          {campaigns.map((c) => {
            const pct = c.stats?.total > 0 ? Math.round((c.stats.sent / c.stats.total) * 100) : 0;
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`}
                className="block rounded-card border border-brand-ink-10 bg-white p-4 shadow-card transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-[14px] font-medium text-brand-ink">
                      {c.name}
                      <span className={`rounded-pill px-2.5 py-0.5 text-[11px] font-medium ${STATUS_BADGES[c.status] || "bg-gray-100"}`}>
                        {LABELS[c.status] || c.status}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-brand-ink-60">
                      {c.stats?.total || 0} contatti · {new Date(c.created_at).toLocaleDateString("it-IT")}
                    </div>
                    {c.stats?.sent > 0 && (
                      <div className="mt-2 flex gap-3.5 text-[11px]">
                        <span className="text-brand-ink-60">Inviati <strong className="text-brand-ink">{c.stats.sent}</strong></span>
                        <span className="text-brand-ink-60">Consegnati <strong className="text-brand-green-dark">{c.stats.total > 0 ? Math.round((c.stats.delivered / c.stats.total) * 100) : 0}%</strong></span>
                        <span className="text-brand-ink-60">Letti <strong className="text-brand-green-dark">{c.stats.total > 0 ? Math.round((c.stats.read / c.stats.total) * 100) : 0}%</strong></span>
                      </div>
                    )}
                    {pct > 0 && (
                      <div className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full bg-brand-ink-10">
                        <div className="h-full rounded-full bg-brand-green" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
          {campaigns.length === 0 && (
            <div className="rounded-card border border-brand-ink-10 bg-white p-12 text-center text-brand-ink-30">
              Nessuna campagna. <Link href="/campaigns/new" className="text-brand-green-dark underline">Creane una!</Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
