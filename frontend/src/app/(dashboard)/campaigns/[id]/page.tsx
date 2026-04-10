"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  stats: { total: number; sent: number; delivered: number; read: number; failed: number };
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  template?: { name: string; category: string };
}

export default function CampaignDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    fetch(`/api/campaigns/${id}`).then((r) => r.json()).then(setCampaign);
  }, [id]);

  async function handleLaunch() {
    setLaunching(true);
    await fetch(`/api/campaigns/${id}/launch`, { method: "POST" });
    setCampaign((prev) => prev ? { ...prev, status: "running" } : prev);
    setLaunching(false);
  }

  if (!campaign) return <div className="animate-pulse text-brand-ink-30">Caricamento...</div>;

  const s = campaign.stats;

  return (
    <>
      <Link href="/campaigns" className="mb-4 inline-block text-[12px] text-brand-green-dark hover:underline">← Torna alle campagne</Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-brand-ink">{campaign.name}</h1>
          <p className="mt-1 text-[11px] text-brand-ink-60">
            {campaign.template?.name && `Template: ${campaign.template.name} · `}
            Creata il {new Date(campaign.created_at).toLocaleDateString("it-IT")}
          </p>
        </div>
        {["draft", "scheduled"].includes(campaign.status) && (
          <button onClick={handleLaunch} disabled={launching}
            className="rounded-sm bg-brand-green px-5 py-2 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(37,211,102,.3)] hover:bg-brand-green-dark disabled:opacity-50">
            {launching ? "Avvio..." : "▶ Avvia campagna"}
          </button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Totale", value: s.total, color: "text-brand-ink" },
          { label: "Inviati", value: s.sent, color: "text-brand-ink" },
          { label: "Consegnati", value: s.delivered, color: "text-brand-green-dark" },
          { label: "Letti", value: s.read, color: "text-brand-green-dark" },
        ].map((item) => (
          <div key={item.label} className="rounded-sm bg-brand-ink-05 p-3.5 text-center">
            <div className={`text-[24px] font-semibold ${item.color}`}>{item.value}</div>
            <div className="mt-0.5 text-[10.5px] text-brand-ink-60">{item.label}</div>
          </div>
        ))}
      </div>

      {s.total > 0 && (
        <div className="rounded-card border border-brand-ink-10 bg-white p-5 shadow-card">
          <div className="mb-3 text-[13px] font-semibold text-brand-ink">Progresso invio</div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-ink-10">
            <div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${Math.round((s.sent / s.total) * 100)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-brand-ink-60">
            <span>{s.sent}/{s.total} inviati</span>
            <span>{s.failed > 0 && <span className="text-red-500">{s.failed} falliti</span>}</span>
          </div>
        </div>
      )}
    </>
  );
}
