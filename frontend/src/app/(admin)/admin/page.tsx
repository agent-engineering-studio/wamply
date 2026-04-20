"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Overview {
  total_users: number;
  mrr_cents: number;
  messages_today: number;
  active_campaigns: number;
  plan_breakdown: Record<string, number>;
}

interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  subscription: { status: string; plans: { name: string; slug: string } } | null;
  messages_used: number;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  stats: { total: number; sent: number; delivered: number; read: number; failed: number };
  started_at: string | null;
  user: { email: string; full_name: string | null };
}

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-brand-teal",
  professional: "bg-brand-navy",
  enterprise: "bg-brand-purple",
};

export default function AdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tab, setTab] = useState<"overview" | "users" | "campaigns">("overview");

  useEffect(() => {
    Promise.all([
      apiFetch("/admin/overview").then((r) => r.json()),
      apiFetch("/admin/users").then((r) => r.json()),
      apiFetch("/admin/campaigns").then((r) => r.json()),
    ]).then(([o, u, c]) => {
      setOverview(o);
      setUsers(u.users || []);
      setCampaigns(c.campaigns || []);
    });
  }, []);

  if (!overview) return <div className="animate-pulse text-slate-500">Caricamento...</div>;

  const mrrFormatted = ((overview.mrr_cents ?? 0) / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  const planBreakdown = overview.plan_breakdown || {};
  const totalSubs = Object.values(planBreakdown).reduce((a, b) => a + b, 0);
  const messagesToday = (overview.messages_today ?? 0).toLocaleString("it-IT");
  const activeCampaigns = overview.active_campaigns ?? 0;

  return (
    <>
      {/* Tabs */}
      <div className="mb-5 flex w-fit gap-px rounded-[10px] border border-slate-800 bg-brand-navy-light p-[3px]">
        {(["overview", "users", "campaigns"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-sm px-4 py-1.5 text-[12.5px] font-medium ${tab === t ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-100"}`}>
            {t === "overview" ? "Overview" : t === "users" ? "Utenti" : "Campagne"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {/* Stats */}
          <div className="mb-5 grid grid-cols-4 gap-3.5">
            <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
              <div className="text-[26px] font-semibold text-slate-100">{overview.total_users}</div>
              <div className="text-[11px] text-slate-400">Utenti totali</div>
            </div>
            <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
              <div className="text-[26px] font-semibold text-slate-100">{mrrFormatted}</div>
              <div className="text-[11px] text-slate-400">MRR</div>
            </div>
            <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
              <div className="text-[26px] font-semibold text-slate-100">{messagesToday}</div>
              <div className="text-[11px] text-slate-400">Messaggi oggi</div>
            </div>
            <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
              <div className="text-[26px] font-semibold text-slate-100">{activeCampaigns}</div>
              <div className="text-[11px] text-slate-400">Campagne attive</div>
            </div>
          </div>

          {/* MRR Breakdown */}
          <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
            <div className="mb-4 text-[13px] font-semibold text-slate-100">Revenue per piano</div>
            {Object.entries(planBreakdown).map(([slug, count]) => {
              const pct = totalSubs > 0 ? Math.round((count / totalSubs) * 100) : 0;
              return (
                <div key={slug} className="mb-2.5 flex items-center gap-3">
                  <span className="w-[90px] text-[12px] capitalize text-slate-400">{slug}</span>
                  <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full rounded-full ${PLAN_COLORS[slug] || "bg-gray-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-12 text-right text-[12px] font-medium text-slate-100">{count}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "users" && (
        <div className="overflow-hidden rounded-card border border-slate-800 bg-brand-navy-light shadow-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-brand-navy-deep">
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Utente</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Piano</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Stato</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Messaggi</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Registrato</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/50 last:border-0 hover:bg-brand-navy-deep">
                  <td className="px-3.5 py-3">
                    <div className="text-[13px] font-medium text-slate-100">{u.full_name || u.email}</div>
                    <div className="text-[11px] text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-3.5 py-3 text-[13px] capitalize text-slate-100">{(u.subscription?.plans as Record<string, string>)?.name || "—"}</td>
                  <td className="px-3.5 py-3">
                    <span className={`rounded-pill px-2 py-0.5 text-[10px] font-medium ${u.subscription?.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                      {u.subscription?.status || "nessuno"}
                    </span>
                  </td>
                  <td className="px-3.5 py-3 text-[13px] text-slate-100">{u.messages_used}</td>
                  <td className="px-3.5 py-3 text-[11px] text-slate-400">{new Date(u.created_at).toLocaleDateString("it-IT")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "campaigns" && (
        <div className="space-y-2.5">
          {campaigns.map((c) => {
            const pct = c.stats?.total > 0 ? Math.round((c.stats.sent / c.stats.total) * 100) : 0;
            return (
              <div key={c.id} className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-medium text-slate-100">{c.name}</div>
                    <div className="text-[11px] text-slate-400">{c.user?.full_name || c.user?.email} · {c.stats?.total} contatti</div>
                  </div>
                  <span className={`rounded-pill px-2.5 py-0.5 text-[11px] font-medium ${c.status === "running" ? "bg-amber-100 text-amber-800" : "bg-purple-100 text-purple-800"}`}>
                    {c.status === "running" ? "in corso" : "schedulato"}
                  </span>
                </div>
                {pct > 0 && (
                  <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-brand-teal" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          {campaigns.length === 0 && (
            <div className="rounded-card border border-slate-800 bg-brand-navy-light p-8 text-center text-slate-500">
              Nessuna campagna in corso
            </div>
          )}
        </div>
      )}
    </>
  );
}
