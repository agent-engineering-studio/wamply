"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Group {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
}

interface Props {
  open: boolean;
  group?: Group;
  onClose: () => void;
  onSaved: () => void;
}

export function GroupModal({ open, group, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(group?.name ?? "");
      setDescription(group?.description ?? "");
      setError(null);
    }
  }, [open, group]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Il nome del gruppo è obbligatorio."); return; }
    setSaving(true);
    setError(null);
    const body = { name: name.trim(), description: description.trim() || null };
    try {
      const r = await apiFetch(
        group ? `/groups/${group.id}` : "/groups",
        { method: group ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-card">
        <h2 className="mb-4 text-[15px] font-semibold text-slate-100">
          {group ? "Modifica gruppo" : "Nuovo gruppo"}
        </h2>
        {error && (
          <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="gm-name" className="mb-1 block text-[11.5px] font-medium text-slate-400">
              Nome gruppo *
            </label>
            <input
              id="gm-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. VIP Milano"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="gm-desc" className="mb-1 block text-[11.5px] font-medium text-slate-400">Descrizione</label>
            <textarea
              id="gm-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Clienti premium della sede di Milano"
              className="w-full resize-none rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-pill border border-slate-700 px-4 py-2 text-[12.5px] font-medium text-slate-300 hover:border-slate-600"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : group ? "Salva" : "Crea gruppo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
