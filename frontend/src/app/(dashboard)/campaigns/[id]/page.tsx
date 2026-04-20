"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";

interface CampaignStats { total: number; sent: number; delivered: number; read: number; failed: number }
interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  stats?: CampaignStats;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  template?: { name: string; category: string };
  template_name?: string | null;
  template_category?: string | null;
}

const EMPTY_STATS: CampaignStats = { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 };

export default function CampaignDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    apiFetch(`/campaigns/${id}`).then((r) => r.json()).then(setCampaign);
  }, [id]);

  async function handleLaunch() {
    setLaunching(true);
    await apiFetch(`/campaigns/${id}/launch`, { method: "POST" });
    setCampaign((prev) => prev ? { ...prev, status: "running" } : prev);
    setLaunching(false);
  }

  if (!campaign) return <div className="animate-pulse text-slate-500">Caricamento...</div>;

  const s = campaign.stats ?? EMPTY_STATS;
  const templateName = campaign.template?.name ?? campaign.template_name ?? null;
  const createdDate = campaign.created_at ? new Date(campaign.created_at) : null;
  const createdLabel = createdDate && !isNaN(createdDate.getTime())
    ? createdDate.toLocaleDateString("it-IT")
    : null;

  return (
    <>
      <Link href="/campaigns" className="mb-4 inline-block text-[12px] text-brand-teal hover:underline">← Torna alle campagne</Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-slate-100">{campaign.name}</h1>
          <p className="mt-1 text-[11px] text-slate-400">
            {templateName && `Template: ${templateName} · `}
            {createdLabel ? `Creata il ${createdLabel}` : "Appena creata"}
          </p>
        </div>
        {["draft", "scheduled"].includes(campaign.status) && (
          <button onClick={handleLaunch} disabled={launching}
            className="rounded-sm bg-brand-teal px-5 py-2 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(37,211,102,.3)] hover:bg-brand-teal-dark disabled:opacity-50">
            {launching ? "Avvio..." : "▶ Avvia campagna"}
          </button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Totale", value: s.total, color: "text-slate-100" },
          { label: "Inviati", value: s.sent, color: "text-slate-100" },
          { label: "Consegnati", value: s.delivered, color: "text-brand-teal" },
          { label: "Letti", value: s.read, color: "text-brand-teal" },
        ].map((item) => (
          <div key={item.label} className="rounded-sm bg-brand-navy-deep p-3.5 text-center">
            <div className={`text-[24px] font-semibold ${item.color}`}>{item.value}</div>
            <div className="mt-0.5 text-[10.5px] text-slate-400">{item.label}</div>
          </div>
        ))}
      </div>

      {s.total > 0 && (
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
          <div className="mb-3 text-[13px] font-semibold text-slate-100">Progresso invio</div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-brand-teal transition-all" style={{ width: `${Math.round((s.sent / s.total) * 100)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-400">
            <span>{s.sent}/{s.total} inviati</span>
            <span>{s.failed > 0 && <span className="text-red-500">{s.failed} falliti</span>}</span>
          </div>
        </div>
      )}
    </>
  );
}
