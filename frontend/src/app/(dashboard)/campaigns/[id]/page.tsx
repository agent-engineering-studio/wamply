"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { CampaignInsights } from "./_components/CampaignInsights";
import { TestSendModal } from "../_components/TestSendModal";

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
  const [testSendOpen, setTestSendOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { status: agentStatus } = useAgentStatus();
  const aiEnabled = !!agentStatus?.active;

  useEffect(() => {
    apiFetch(`/campaigns/${id}`).then((r) => r.json()).then(setCampaign);
  }, [id]);

  async function handleDelete() {
    if (!confirm(`Eliminare la campagna "${campaign?.name}"?`)) return;
    setDeleting(true);
    try {
      const r = await apiFetch(`/campaigns/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      router.push("/campaigns");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Errore eliminazione.");
      setDeleting(false);
    }
  }

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
        <div className="flex items-center gap-2">
          {campaign.status === "draft" && (
            <>
              <button
                type="button"
                onClick={() => setTestSendOpen(true)}
                className="rounded-pill border border-brand-teal/50 px-4 py-2 text-[13px] font-medium text-brand-teal hover:border-brand-teal hover:bg-brand-teal/10"
              >
                Invia test
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-pill border border-rose-500/30 px-4 py-2 text-[13px] font-medium text-rose-400 hover:border-rose-400 disabled:opacity-40"
              >
                {deleting ? "Eliminazione…" : "Elimina"}
              </button>
            </>
          )}
          {["draft", "scheduled"].includes(campaign.status) && (
            <button type="button" onClick={handleLaunch} disabled={launching}
              className="rounded-sm bg-brand-teal px-5 py-2 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(37,211,102,.3)] hover:bg-brand-teal-dark disabled:opacity-50">
              {launching ? "Avvio..." : "▶ Avvia campagna"}
            </button>
          )}
        </div>
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
        <div className="mb-5 rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
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

      {s.sent > 0 && typeof id === "string" && (
        <CampaignInsights campaignId={id} aiEnabled={aiEnabled} />
      )}

      <TestSendModal
        open={testSendOpen}
        campaignId={String(id)}
        onClose={() => setTestSendOpen(false)}
      />
    </>
  );
}
