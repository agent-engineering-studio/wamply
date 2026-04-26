"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { CampaignAnalytics } from "./_components/CampaignAnalytics";
import { CampaignInsights } from "./_components/CampaignInsights";
import { SendProgress } from "./_components/SendProgress";
import { MessagesTab } from "./_components/MessagesTab";
import { RecipientsSelector } from "./_components/RecipientsSelector";
import { TestSendModal } from "../_components/TestSendModal";

interface CampaignStats { total: number; sent: number; delivered: number; read: number; failed: number }
interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  group_id: string | null;
  stats?: CampaignStats;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  template?: { name: string; category: string };
  template_name?: string | null;
  template_category?: string | null;
}

const EMPTY_STATS: CampaignStats = { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 };

function StatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return <span className="rounded-pill bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">Completata</span>;
  if (status === "failed")
    return <span className="rounded-pill bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-400">Fallita</span>;
  if (status === "running")
    return (
      <span className="flex items-center gap-1 rounded-pill bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 animate-spin">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        In invio
      </span>
    );
  return <span className="rounded-pill bg-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-400">Bozza</span>;
}

function DraftPreview({ campaign, aiEnabled, campaignId }: {
  campaign: CampaignDetail;
  aiEnabled: boolean;
  campaignId: string;
}) {
  const templateName = campaign.template?.name ?? campaign.template_name ?? null;
  const templateCategory = campaign.template?.category ?? campaign.template_category ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-6">
        <div className="mb-3 flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-brand-teal">
            <path d="M8 5v14l11-7z" />
          </svg>
          <h3 className="text-[14px] font-semibold text-slate-100">Pronta per l&apos;invio</h3>
        </div>
        <p className="text-[12px] text-slate-400">
          Configura i destinatari nel pannello a destra, verifica il template, poi clicca <span className="font-medium text-slate-200">Avvia</span> in alto.
        </p>
        <dl className="mt-4 space-y-0">
          <div className="flex items-center justify-between border-t border-slate-800 py-2.5 text-[12px]">
            <dt className="text-slate-500">Template</dt>
            <dd className="font-medium text-slate-200">{templateName ?? "—"}</dd>
          </div>
          {templateCategory && (
            <div className="flex items-center justify-between border-t border-slate-800 py-2.5 text-[12px]">
              <dt className="text-slate-500">Categoria</dt>
              <dd className="text-slate-300">{templateCategory}</dd>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-800 py-2.5 text-[12px]">
            <dt className="text-slate-500">Stato</dt>
            <dd className="text-slate-300">Bozza</dd>
          </div>
        </dl>
      </div>
      <CampaignInsights campaignId={campaignId} aiEnabled={aiEnabled} />
    </div>
  );
}

export default function CampaignDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [launching, setLaunching] = useState(false);
  const [testSendOpen, setTestSendOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [resendingFailed, setResendingFailed] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"reset" | "delete" | null>(null);
  const [messagesFilter, setMessagesFilter] = useState<string>("");
  const { status: agentStatus } = useAgentStatus();
  const aiEnabled = !!agentStatus?.active;

  useEffect(() => {
    apiFetch(`/campaigns/${id}`).then((r) => r.json()).then(setCampaign);
  }, [id]);

  // Poll while running; keep fetching at increasing intervals after completion to capture final stats
  useEffect(() => {
    if (!campaign || campaign.status !== "running") return;
    const interval = setInterval(() => {
      apiFetch(`/campaigns/${id}`)
        .then((r) => r.json())
        .then((data) => {
          setCampaign(data);
          if (data.status !== "running") {
            clearInterval(interval);
            [1500, 3500, 6000, 10000].forEach((delay) => {
              setTimeout(() => {
                apiFetch(`/campaigns/${id}`).then((r) => r.json()).then(setCampaign).catch(() => {});
              }, delay);
            });
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [campaign?.status, id]);

  async function handleReset() {
    setActionPending(true);
    setConfirmAction(null);
    try {
      const r = await apiFetch(`/campaigns/${id}/reset`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
      setCampaign(await r.json());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Errore nel reset.");
    }
    setActionPending(false);
  }

  async function handleDelete() {
    setActionPending(true);
    setConfirmAction(null);
    try {
      const r = await apiFetch(`/campaigns/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
      router.push("/campaigns");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Errore eliminazione.");
      setActionPending(false);
    }
  }

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const r = await apiFetch(`/campaigns/${id}/duplicate`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
      router.push(`/campaigns/${(await r.json()).id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Errore nella duplicazione.");
      setDuplicating(false);
    }
  }

  async function handleResendFailed() {
    setResendingFailed(true);
    try {
      const r = await apiFetch(`/campaigns/${id}/resend-failed`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
      router.push(`/campaigns/${(await r.json()).id}`);
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
  const isDraft = campaign.status === "draft";
  const isRunning = campaign.status === "running";
  const templateName = campaign.template?.name ?? campaign.template_name ?? null;
  const createdDate = campaign.created_at ? new Date(campaign.created_at) : null;
  const createdLabel = createdDate && !isNaN(createdDate.getTime()) ? createdDate.toLocaleDateString("it-IT") : null;

  const statCards = [
    { label: "Totale",     value: s.total,     color: "text-slate-100",   filter: "" },
    { label: "Inviati",    value: s.sent,      color: "text-slate-100",   filter: "sent" },
    { label: "Consegnati", value: s.delivered, color: "text-brand-teal",  filter: "delivered" },
    { label: "Letti",      value: s.read,      color: "text-brand-teal",  filter: "read" },
    { label: "Falliti",    value: s.failed,    color: s.failed > 0 ? "text-rose-400" : "text-slate-500", filter: "failed" },
  ];

  const resetLabel = s.sent > 0
    ? `La campagna ha già inviato ${s.sent} messaggi. Riportarla a bozza cancellerà i log di invio.`
    : "Riportare la campagna a bozza?";

  return (
    <>
      <Link href="/campaigns" className="mb-4 inline-flex items-center gap-1 text-[12px] text-brand-teal hover:underline">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Torna alle campagne
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[18px] font-semibold text-slate-100">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {templateName && `Template: ${templateName} · `}
            {createdLabel ? `Creata il ${createdLabel}` : "Appena creata"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isDraft && (
            <button type="button" onClick={() => setTestSendOpen(true)}
              className="flex items-center gap-1.5 rounded-pill border border-slate-600 px-3 py-1.5 text-[12px] font-medium text-slate-300 transition-colors hover:border-slate-400 hover:text-slate-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" />
              </svg>
              Invia test
            </button>
          )}

          {!isDraft && (
            <button type="button" onClick={() => setConfirmAction("reset")} disabled={actionPending || isRunning}
              className="flex items-center gap-1.5 rounded-pill border border-slate-700 px-3 py-1.5 text-[12px] font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 disabled:opacity-40">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
              </svg>
              A bozza
            </button>
          )}

          {s.failed > 0 && !isRunning && (
            <button type="button" onClick={handleResendFailed} disabled={resendingFailed}
              className="flex items-center gap-1.5 rounded-pill border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[12px] font-medium text-amber-400 transition-colors hover:border-amber-400 hover:bg-amber-400/10 disabled:opacity-40">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M21 2H3v16h5l3 3 3-3h7V2zM12 8v4M12 16h.01" />
              </svg>
              {resendingFailed ? "Creazione…" : `Reinvia ${s.failed} falliti`}
            </button>
          )}

          {s.sent > 0 && (
            <button type="button" onClick={handleExportCsv}
              className="flex items-center gap-1.5 rounded-pill border border-slate-700 px-3 py-1.5 text-[12px] font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              CSV
            </button>
          )}

          <button type="button" onClick={handleDuplicate} disabled={duplicating}
            className="flex items-center gap-1.5 rounded-pill border border-slate-700 px-3 py-1.5 text-[12px] font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 disabled:opacity-40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {duplicating ? "…" : "Duplica"}
          </button>

          {isDraft && (
            <button type="button" onClick={() => setConfirmAction("delete")}
              className="flex items-center gap-1.5 rounded-pill border border-rose-500/30 px-3 py-1.5 text-[12px] font-medium text-rose-400 transition-colors hover:border-rose-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              </svg>
              Elimina
            </button>
          )}

          {["draft", "scheduled"].includes(campaign.status) && (
            <button type="button" onClick={handleLaunch} disabled={launching}
              className="flex items-center gap-1.5 rounded-sm bg-brand-teal px-4 py-1.5 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(37,211,102,.3)] hover:bg-brand-teal-dark disabled:opacity-50">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8 5v14l11-7z" />
              </svg>
              {launching ? "Avvio..." : "Avvia"}
            </button>
          )}
        </div>
      </div>

      {/* Inline confirmation banner — replaces browser confirm() */}
      {confirmAction && (
        <div className="mb-5 flex items-center gap-3 rounded-sm border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-[12px]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-amber-400">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="flex-1 text-amber-200">
            {confirmAction === "reset" ? resetLabel : `Eliminare definitivamente la campagna "${campaign.name}"?`}
          </span>
          <button type="button"
            onClick={() => confirmAction === "reset" ? handleReset() : handleDelete()}
            className="shrink-0 rounded-sm bg-amber-500/20 px-3 py-1.5 font-medium text-amber-300 hover:bg-amber-500/30">
            Conferma
          </button>
          <button type="button" onClick={() => setConfirmAction(null)}
            className="shrink-0 rounded-sm border border-slate-700 px-3 py-1.5 text-slate-400 hover:border-slate-500">
            Annulla
          </button>
        </div>
      )}

      {/* Stats bar — always visible; counters reflect current state (0 for drafts) */}
      <div className="mb-5 grid grid-cols-5 gap-2">
        {statCards.map((item) => {
          const dimmed = isDraft;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => !isDraft && setMessagesFilter(item.filter)}
              disabled={isDraft}
              title={isDraft ? "Disponibile dopo l'avvio" : `Filtra per: ${item.label}`}
              className={`group rounded-sm p-3 text-center transition-colors ${
                !isDraft && messagesFilter === item.filter
                  ? "bg-slate-800 ring-1 ring-brand-teal/40"
                  : "bg-brand-navy-deep hover:bg-slate-800/60"
              } ${isDraft ? "cursor-default" : ""}`}
            >
              <div className={`text-[22px] font-semibold tabular-nums ${dimmed ? "text-slate-600" : item.color}`}>{item.value}</div>
              <div className={`mt-0.5 text-[10.5px] ${dimmed ? "text-slate-600" : "text-slate-400 group-hover:text-slate-300"}`}>{item.label}</div>
            </button>
          );
        })}
      </div>

      {/* Body — single column, sections in fixed order regardless of status */}
      <div className="space-y-4">
        {isRunning && (
          <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
            <SendProgress stats={s} campaignId={String(id)} startedAt={campaign.started_at} />
          </div>
        )}

        {isDraft ? (
          <DraftPreview campaign={campaign} aiEnabled={aiEnabled} campaignId={String(id)} />
        ) : (
          <MessagesTab
            campaignId={String(id)}
            campaignStatus={campaign.status}
            statusFilter={messagesFilter}
            onFilterChange={setMessagesFilter}
          />
        )}

        <RecipientsSelector
          campaignId={String(id)}
          campaignStatus={campaign.status}
          currentGroupId={campaign.group_id}
          onSaved={(gid) => setCampaign((prev) => prev ? { ...prev, group_id: gid } : prev)}
        />

        {s.sent > 0 && !isRunning && (
          <CampaignAnalytics stats={s} />
        )}
      </div>

      <TestSendModal open={testSendOpen} campaignId={String(id)} onClose={() => setTestSendOpen(false)} />
    </>
  );
}
