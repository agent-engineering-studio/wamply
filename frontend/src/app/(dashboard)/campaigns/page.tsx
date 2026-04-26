"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { AICampaignWizard } from "./_components/AICampaignWizard";

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

function CardActions({ campaign, deletingId, resettingId, onDelete, onReset }: {
  campaign: Campaign;
  deletingId: string | null;
  resettingId: string | null;
  onDelete: (e: React.MouseEvent, id: string, name: string) => void;
  onReset: (e: React.MouseEvent, c: Campaign) => void;
}) {
  const canDelete = !["running", "scheduled"].includes(campaign.status);
  const canReset = campaign.status !== "draft";
  if (!canDelete && !canReset) return null;
  return (
    <div className="mt-2 flex items-center justify-end gap-3 border-t border-slate-800/50 pt-2">
      {canReset && (
        <button
          type="button"
          onClick={(e) => onReset(e, campaign)}
          disabled={resettingId === campaign.id}
          className="text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-40"
        >
          {resettingId === campaign.id ? "Reset…" : "↺ Riporta a bozza"}
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={(e) => onDelete(e, campaign.id, campaign.name)}
          disabled={deletingId === campaign.id}
          className="text-[11px] text-rose-400 hover:text-rose-300 disabled:opacity-40"
        >
          {deletingId === campaign.id ? "Eliminazione…" : "Elimina"}
        </button>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const { status: agentStatus } = useAgentStatus();
  const aiEnabled = !!agentStatus?.active;

  function reload() {
    apiFetch(filter ? `/campaigns?status=${filter}` : "/campaigns")
      .then((r) => r.json())
      .then((d) => {
        setCampaigns(d.campaigns || []);
        setLoading(false);
      });
  }

  async function handleReset(e: React.MouseEvent, c: Campaign) {
    e.preventDefault();
    e.stopPropagation();
    const sent = c.stats?.sent ?? 0;
    const msg = sent > 0
      ? `Questa campagna ha già inviato ${sent} messaggi.\n\nRiportarla a bozza cancellerà i log di invio e permetterà di rilanciarla — i destinatari potrebbero ricevere il messaggio di nuovo.\n\nContinuare?`
      : `Riportare "${c.name}" a bozza?`;
    if (!confirm(msg)) return;
    setResettingId(c.id);
    try {
      const r = await apiFetch(`/campaigns/${c.id}/reset`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Errore durante il reset.");
    } finally {
      setResettingId(null);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string, name: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Eliminare la campagna "${name}"? I dati di invio verranno persi.`)) return;
    setDeletingId(id);
    try {
      const r = await apiFetch(`/campaigns/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Errore durante l'eliminazione.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-100">Campagne</h1>
          <p className="text-[11px] text-slate-400">{campaigns.length} campagne totali</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => aiEnabled && setWizardOpen(true)}
            disabled={!aiEnabled}
            title={aiEnabled ? "Crea con AI" : "AI non attiva. Configura una chiave Claude in Impostazioni → AI."}
            className="flex items-center gap-1.5 rounded-sm border border-indigo-500/40 bg-indigo-500/10 px-3.5 py-2 text-[13px] font-medium text-indigo-300 transition-colors hover:border-indigo-400 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
              <path d="M19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
            </svg>
            Crea con AI
          </button>
          <Link
            href="/campaigns/new"
            className="rounded-sm bg-brand-teal px-4 py-2 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(37,211,102,.3)] hover:bg-brand-teal-dark"
          >
            + Nuova
          </Link>
        </div>
      </div>

      <div className="mb-5 flex gap-1.5">
        {[null, "running", "completed", "scheduled", "draft"].map((s) => (
          <button key={s ?? "all"} onClick={() => setFilter(s)}
            className={`rounded-pill px-3 py-1 text-[11px] font-medium ${filter === s ? "bg-green-100 text-green-800" : "bg-slate-800 text-slate-400 hover:bg-slate-800"}`}>
            {s ? LABELS[s] || s : "Tutte"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse text-slate-500">Caricamento...</div>
      ) : (
        <div className="space-y-2.5">
          {campaigns.map((c) => {
            const pct = c.stats?.total > 0 ? Math.round((c.stats.sent / c.stats.total) * 100) : 0;
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`}
                className="block rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-[14px] font-medium text-slate-100">
                      {c.name}
                      <span className={`rounded-pill px-2.5 py-0.5 text-[11px] font-medium ${STATUS_BADGES[c.status] || "bg-gray-100"}`}>
                        {LABELS[c.status] || c.status}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {c.stats?.total || 0} contatti · {new Date(c.created_at).toLocaleDateString("it-IT")}
                    </div>
                    {c.stats?.sent > 0 && (
                      <div className="mt-2 flex gap-3.5 text-[11px]">
                        <span className="text-slate-400">Inviati <strong className="text-slate-100">{c.stats.sent}</strong></span>
                        <span className="text-slate-400">Consegnati <strong className="text-brand-teal">{c.stats.total > 0 ? Math.round((c.stats.delivered / c.stats.total) * 100) : 0}%</strong></span>
                        <span className="text-slate-400">Letti <strong className="text-brand-teal">{c.stats.total > 0 ? Math.round((c.stats.read / c.stats.total) * 100) : 0}%</strong></span>
                      </div>
                    )}
                    {pct > 0 && (
                      <div className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-brand-teal" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
                <CardActions
                  campaign={c}
                  deletingId={deletingId}
                  resettingId={resettingId}
                  onDelete={handleDelete}
                  onReset={handleReset}
                />
              </Link>
            );
          })}
          {campaigns.length === 0 && (
            <div className="rounded-card border border-slate-800 bg-brand-navy-light p-10 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                  <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
                  <path d="M19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
                </svg>
              </div>
              <h2 className="mb-1 text-[14px] font-semibold text-slate-100">
                Nessuna campagna ancora
              </h2>
              <p className="mx-auto mb-5 max-w-sm text-[12px] text-slate-400">
                {aiEnabled
                  ? "Lascia che Wamply ti guidi: descrivi l'obiettivo e ricevi segmento, template e orario consigliati in pochi secondi."
                  : "Crea la tua prima campagna manualmente, oppure configura l'AI in Impostazioni per ricevere suggerimenti guidati."}
              </p>
              <div className="flex items-center justify-center gap-2">
                {aiEnabled && (
                  <button
                    type="button"
                    onClick={() => setWizardOpen(true)}
                    className="flex items-center gap-1.5 rounded-pill bg-indigo-500 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-indigo-400"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
                      <path d="M19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
                    </svg>
                    Crea con AI (30 secondi)
                  </button>
                )}
                <Link
                  href="/campaigns/new"
                  className="rounded-pill border border-slate-700 px-4 py-2 text-[12.5px] font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100"
                >
                  Crea manualmente
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      <AICampaignWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => {
          setWizardOpen(false);
          reload();
        }}
      />
    </>
  );
}
