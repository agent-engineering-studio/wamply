"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";

interface DashboardData {
  contacts: number;
  messages: number;
  deliveryRate: number;
  readRate: number;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    stats: { total: number; sent: number; delivered: number; read: number; failed: number };
    started_at: string | null;
  }>;
}

const STATUS_BADGES: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  running: "bg-amber-100 text-amber-800",
  scheduled: "bg-purple-100 text-purple-800",
  draft: "bg-gray-100 text-gray-600",
  failed: "bg-red-100 text-red-800",
  paused: "bg-blue-100 text-blue-800",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "completato",
  running: "in corso",
  scheduled: "schedulato",
  draft: "bozza",
  failed: "fallito",
  paused: "in pausa",
};

export default function DashboardHome() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    async function load() {
      const [planRes, campRes] = await Promise.all([
        apiFetch("/me/plan").then((r) => r.json()),
        apiFetch("/campaigns").then((r) => r.json()),
      ]);
      const campaigns = campRes.campaigns || [];
      const totalSent = campaigns.reduce((s: number, c: { stats: { sent: number } }) => s + (c.stats?.sent || 0), 0);
      const totalDelivered = campaigns.reduce((s: number, c: { stats: { delivered: number } }) => s + (c.stats?.delivered || 0), 0);
      const totalRead = campaigns.reduce((s: number, c: { stats: { read: number } }) => s + (c.stats?.read || 0), 0);

      setData({
        contacts: planRes.usage?.contacts_count || 0,
        messages: totalSent,
        deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
        readRate: totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0,
        campaigns: campaigns.slice(0, 5),
      });
    }
    load();
  }, []);

  if (!data) return <div className="animate-pulse text-slate-500">Caricamento...</div>;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-100">Buongiorno 👋</h1>
          <p className="text-[11px] text-slate-400">Ecco cosa sta succedendo oggi</p>
        </div>
        <Link href="/campaigns/new" className="rounded-sm bg-brand-teal px-4 py-2 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(37,211,102,.3)] hover:bg-brand-teal-dark">
          + Nuova campagna
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-4 gap-3.5">
        {[
          { label: "Contatti totali", value: data.contacts.toLocaleString("it-IT"), color: "bg-brand-teal/15", stroke: "#128C7E" },
          { label: "Messaggi inviati", value: data.messages.toLocaleString("it-IT"), color: "bg-blue-50", stroke: "#1565C0" },
          { label: "Tasso consegna", value: `${data.deliveryRate}%`, color: "bg-brand-teal/15", stroke: "#128C7E" },
          { label: "Tasso lettura", value: `${data.readRate}%`, color: "bg-purple-50", stroke: "#5B21B6" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
            <div className={`mb-3 flex h-[38px] w-[38px] items-center justify-center rounded-[10px] ${stat.color}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke={stat.stroke} strokeWidth="2" className="h-[18px] w-[18px]">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="text-[26px] font-semibold leading-none text-slate-100">{stat.value}</div>
            <div className="mt-1 text-[11px] text-slate-400">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-5">
        <div className="mb-3 text-[13px] font-semibold text-slate-100">Azioni rapide</div>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { href: "/campaigns/new", title: "Invia messaggio", desc: "Testo, img, video, PDF", color: "bg-brand-teal/15" },
            { href: "/contacts", title: "Importa contatti", desc: "CSV o manuale", color: "bg-blue-50" },
            { href: "/campaigns", title: "Vedi campagne", desc: "Statistiche e risultati", color: "bg-amber-50" },
          ].map((qa) => (
            <Link key={qa.href} href={qa.href} className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card transition-shadow hover:shadow-md">
              <div className={`mb-2.5 flex h-9 w-9 items-center justify-center rounded-[10px] ${qa.color}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#128C7E" strokeWidth="2" className="h-[17px] w-[17px]">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </div>
              <div className="text-[13px] font-medium text-slate-100">{qa.title}</div>
              <div className="text-[11px] text-slate-400">{qa.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Campaigns */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-slate-100">Campagne recenti</span>
          <Link href="/campaigns" className="text-[12px] font-medium text-brand-teal">Vedi tutte →</Link>
        </div>
        <div className="overflow-hidden rounded-card border border-slate-800 bg-brand-navy-light shadow-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-brand-navy-deep">
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Campagna</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Stato</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Inviati</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Letti</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.id} className="border-b border-slate-800/50 last:border-0 hover:bg-brand-navy-deep">
                  <td className="px-3.5 py-3">
                    <Link href={`/campaigns/${c.id}`} className="text-[13px] font-medium text-slate-100 hover:text-brand-teal">{c.name}</Link>
                    <div className="text-[11px] text-slate-400">{c.stats?.total || 0} destinatari</div>
                  </td>
                  <td className="px-3.5 py-3">
                    <span className={`inline-block rounded-pill px-2.5 py-0.5 text-[11px] font-medium ${STATUS_BADGES[c.status] || "bg-gray-100"}`}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </td>
                  <td className="px-3.5 py-3 text-[13px] text-slate-100">{c.stats?.sent || 0}</td>
                  <td className="px-3.5 py-3 text-[13px] font-medium text-brand-teal">{c.stats?.read || 0}</td>
                </tr>
              ))}
              {data.campaigns.length === 0 && (
                <tr><td colSpan={4} className="px-3.5 py-8 text-center text-[13px] text-slate-500">Nessuna campagna ancora</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
