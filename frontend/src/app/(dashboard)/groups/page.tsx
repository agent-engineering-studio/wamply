"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { SmartGroupWizard } from "./_components/SmartGroupWizard";
import { GroupModal } from "./_components/GroupModal";
import { GroupMembersModal } from "./_components/GroupMembersModal";

interface Group {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | undefined>(undefined);
  const [membersModalGroup, setMembersModalGroup] = useState<Group | null>(null);
  const { status: agentStatus } = useAgentStatus();
  const aiEnabled = !!agentStatus?.active;

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch("/groups")
      .then((r) => r.json())
      .then((d) => setGroups(d.groups || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Eliminare il gruppo "${name}"? I contatti restano, solo il gruppo viene rimosso.`)) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/groups/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setGroups((g) => g.filter((x) => x.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Errore durante l'eliminazione.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-100">Gruppi</h1>
          <p className="text-[11px] text-slate-400">
            {groups.length} {groups.length === 1 ? "gruppo" : "gruppi"}
          </p>
        </div>
        <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setEditingGroup(undefined); setGroupModalOpen(true); }}
          className="flex items-center gap-1.5 rounded-sm border border-slate-700 bg-brand-navy-light px-3.5 py-2 text-[13px] font-medium text-slate-300 transition-colors hover:border-slate-600"
        >
          + Crea manuale
        </button>
        <button
          type="button"
          onClick={() => aiEnabled && setWizardOpen(true)}
          disabled={!aiEnabled}
          title={aiEnabled ? "Crea gruppo con AI" : "AI non attiva"}
          className="flex items-center gap-1.5 rounded-sm border border-indigo-500/40 bg-indigo-500/10 px-3.5 py-2 text-[13px] font-medium text-indigo-300 transition-colors hover:border-indigo-400 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
            <path d="M19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
          </svg>
          Crea con AI
        </button>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse text-slate-500">Caricamento...</div>
      ) : groups.length === 0 ? (
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-10 text-center shadow-card">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <h2 className="mb-1 text-[14px] font-semibold text-slate-100">Nessun gruppo ancora</h2>
          <p className="mx-auto mb-5 max-w-sm text-[12px] text-slate-400">
            I gruppi segmentano i tuoi contatti per campagne mirate. Descrivi in parole chi
            vuoi raggiungere — l&apos;AI propone il filtro.
          </p>
          {aiEnabled ? (
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="rounded-pill bg-indigo-500 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-indigo-400"
            >
              Crea con AI
            </button>
          ) : (
            <p className="text-[11.5px] text-slate-500">
              Configura una chiave Claude in Impostazioni → AI per usare il wizard.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {groups.map((g) => (
            <div
              key={g.id}
              className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card transition-all hover:border-brand-teal hover:shadow-md"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-teal/15 text-brand-teal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </div>
              <div className="text-[13.5px] font-medium text-slate-100">{g.name}</div>
              {g.description && (
                <div className="mt-0.5 text-[11px] text-slate-400">{g.description}</div>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2.5">
                <span className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  {g.member_count} contatti
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMembersModalGroup(g)}
                    className="text-[11px] font-medium text-brand-teal hover:text-brand-teal-dark"
                  >
                    Membri
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingGroup(g); setGroupModalOpen(true); }}
                    className="text-[11px] font-medium text-slate-400 hover:text-slate-200"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(g.id, g.name)}
                    disabled={deletingId === g.id}
                    className="text-[11px] font-medium text-rose-400 hover:text-rose-300 disabled:opacity-40"
                  >
                    {deletingId === g.id ? "Elimino..." : "Elimina"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <GroupModal
        open={groupModalOpen}
        group={editingGroup}
        onClose={() => setGroupModalOpen(false)}
        onSaved={() => { setGroupModalOpen(false); reload(); }}
      />

      {membersModalGroup && (
        <GroupMembersModal
          open={!!membersModalGroup}
          groupId={membersModalGroup.id}
          groupName={membersModalGroup.name}
          onClose={() => setMembersModalGroup(null)}
          onChanged={() => reload()}
        />
      )}

      <SmartGroupWizard
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
