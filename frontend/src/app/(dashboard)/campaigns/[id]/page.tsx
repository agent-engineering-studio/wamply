"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { CampaignAnalytics } from "./_components/CampaignAnalytics";
import { CampaignInsights } from "./_components/CampaignInsights";
import { SendProgress } from "./_components/SendProgress";
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
  const [duplicating, setDuplicating] = useState(false);
  const [resendingFailed, setResendingFailed] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "analytics">("overview");
  const { status: agentStatus } = useAgentStatus();
  const aiEnabled = !!agentStatus?.active;

  useEffect(() => {
    apiFetch(`/campaigns/${id}`).then((r) => r.json()).then(setCampaign);
  }, [id]);

  useEffect(() => {
    if (!campaign || campaign.status !== "running") return;
    const interval = setInterval(() => {
      apiFetch(`/campaigns/${id}`)
        .then((r) => r.json())
        .then((data) => {
          setCampaign(data);
          if (data.status !== "running") clearInterval(interval);
        })
        .catch(() => {/* ignore polling errors */});
    }, 3000);
    return () => clearInterval(interval);
  }, [campaign?.status, id]);

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

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const r = await apiFetch(`/campaigns/${id}/duplicate`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
      const newCampaign = await r.json();
      router.push(`/campaigns/${newCampaign.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Errore nella duplicazione.");
      setDuplicating(false);
    }
  }

  async function handleResendFailed() {
    if (!confirm(`Creare una nuova campagna con i ${s.failed} messaggi falliti?`)) return;
    setResendingFailed(true);
    try {
      const r = await apiFetch(`/campaigns/${id}/resend-failed`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
      const newCampaign = await r.json();
      router.push(`/campaigns/${newCampaign.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Errore nella creazione della campagna.");
      setResendingFailed(false);
    }
  }

  async function handleExportCsv() {
    try {
      const r = await apiFetch(`/campaigns/${id}/export`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campagna-${String(id).slice(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Errore nell'esportazione.");
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
          {s.failed > 0 && campaign.status !== "running" && (
            <button
              type="button"
              onClick={handleResendFailed}
              disabled={resendingFailed}
              className="rounded-pill border border-amber-500/40 px-4 py-2 text-[13px] font-medium text-amber-400 hover:border-amber-400 hover:bg-amber-400/10 disabled:opacity-40"
            >
              {resendingFailed ? "Creazione…" : `↩ Reinvia ${s.failed} falliti`}
            </button>
          )}
          {s.sent > 0 && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="rounded-pill border border-slate-600 px-4 py-2 text-[13px] font-medium text-slate-300 hover:border-slate-400 hover:text-slate-100"
            >
              ↓ Esporta CSV
            </button>
          )}
          {campaign.status !== "running" && (
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={duplicating}
              className="rounded-pill border border-slate-600 px-4 py-2 text-[13px] font-medium text-slate-300 hover:border-slate-400 hover:text-slate-100 disabled:opacity-40"
            >
              {duplicating ? "Duplicazione…" : "Duplica"}
            </button>
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

      {campaign.status === "running" && (
        <div className="mb-5 rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
          <SendProgress stats={s} />
        </div>
      )}

      {(s.sent > 0 || campaign.status === "completed") && (
        <div className="mb-5 flex gap-1 border-b border-slate-800 text-[13px]">
          {(["overview", "analytics"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-brand-teal text-brand-teal"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab === "overview" ? "Panoramica" : "Analitiche"}
            </button>
          ))}
        </div>
      )}

      {activeTab === "analytics" && s.sent > 0 && (
        <div className="mb-5">
          <CampaignAnalytics stats={s} />
        </div>
      )}

      {activeTab === "overview" && typeof id === "string" && (
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
