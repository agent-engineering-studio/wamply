"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface MemberRow {
  id: string;
  phone: string;
  name: string | null;
}

interface ContactRow {
  id: string;
  phone: string;
  name: string | null;
}

interface Props {
  open: boolean;
  groupId: string;
  groupName: string;
  onClose: () => void;
  onChanged: () => void;
}

export function GroupMembersModal({ open, groupId, groupName, onClose, onChanged }: Props) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [mRes, cRes] = await Promise.all([
      apiFetch(`/groups/${groupId}/members`).then((r) => r.json()),
      apiFetch(`/contacts?search=${encodeURIComponent(search)}`).then((r) => r.json()),
    ]);
    setMembers(mRes.members || []);
    setContacts(cRes.contacts || []);
    setLoading(false);
  }, [groupId, search]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  if (!open) return null;

  const memberIds = new Set(members.map((m) => m.id));

  async function handleAdd(contactId: string) {
    const r = await apiFetch(`/groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify({ contact_id: contactId }),
    });
    if (!r.ok) { setMsg("Errore aggiunta membro."); return; }
    setMsg(null);
    onChanged();
    loadData();
  }

  async function handleRemove(contactId: string) {
    const r = await apiFetch(`/groups/${groupId}/members/${contactId}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) { setMsg("Errore rimozione membro."); return; }
    setMsg(null);
    onChanged();
    loadData();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-card border border-slate-800 bg-brand-navy-light shadow-card" style={{ maxHeight: "80vh" }}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-slate-100">Membri di {groupName}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {msg && (
          <div className="mx-4 mt-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {msg}
          </div>
        )}

        <div className="grid flex-1 grid-cols-2 gap-0 overflow-hidden">
          <div className="flex flex-col border-r border-slate-800">
            <div className="border-b border-slate-800 px-4 py-2.5">
              <p className="text-[11.5px] font-medium text-slate-400">Membri attuali ({members.length})</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-[12px] text-slate-500">Caricamento…</div>
              ) : members.length === 0 ? (
                <div className="p-4 text-center text-[12px] text-slate-500">Nessun membro.</div>
              ) : members.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b border-slate-800/40 px-4 py-2">
                  <div>
                    <div className="text-[12.5px] text-slate-100">{m.name || "Senza nome"}</div>
                    <div className="font-mono text-[11px] text-slate-400">{m.phone}</div>
                  </div>
                  <button type="button" onClick={() => handleRemove(m.id)} className="text-[11px] text-rose-400 hover:text-rose-300">
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="border-b border-slate-800 px-4 py-2.5">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca contatto…"
                className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-2 py-1.5 text-[12px] text-slate-100 placeholder-slate-500 focus:border-brand-teal focus:outline-none"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {contacts.map((c) => {
                const isMember = memberIds.has(c.id);
                return (
                  <div key={c.id} className="flex items-center justify-between border-b border-slate-800/40 px-4 py-2">
                    <div>
                      <div className="text-[12.5px] text-slate-100">{c.name || "Senza nome"}</div>
                      <div className="font-mono text-[11px] text-slate-400">{c.phone}</div>
                    </div>
                    {isMember ? (
                      <span className="text-[11px] text-brand-teal">Già membro</span>
                    ) : (
                      <button type="button" onClick={() => handleAdd(c.id)} className="text-[11px] text-brand-teal hover:text-brand-teal-dark">
                        + Aggiungi
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
