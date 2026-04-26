"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Contact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: string[] | null;
  opt_in: boolean;
  created_at: string;
}

interface Props {
  open: boolean;
  contact?: Contact;
  onClose: () => void;
  onSaved: () => void;
}

export function ContactModal({ open, contact, onClose, onSaved }: Props) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPhone(contact?.phone ?? "");
      setName(contact?.name ?? "");
      setEmail(contact?.email ?? "");
      setTagsRaw((contact?.tags ?? []).join(", "));
      setError(null);
    }
  }, [open, contact]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) { setError("Il numero di telefono è obbligatorio."); return; }
    setSaving(true);
    setError(null);
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    const body = { phone: phone.trim(), name: name.trim() || null, email: email.trim() || null, tags };
    try {
      const r = await apiFetch(
        contact ? `/contacts/${contact.id}` : "/contacts",
        { method: contact ? "PUT" : "POST", body: JSON.stringify(body) },
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
          {contact ? "Modifica contatto" : "Nuovo contatto"}
        </h2>
        {error && (
          <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="cm-phone" className="mb-1 block text-[11.5px] font-medium text-slate-400">
              Telefono *
            </label>
            <input
              id="cm-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+39 333 1234567"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="cm-name" className="mb-1 block text-[11.5px] font-medium text-slate-400">Nome</label>
            <input
              id="cm-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mario Rossi"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="cm-email" className="mb-1 block text-[11.5px] font-medium text-slate-400">Email</label>
            <input
              id="cm-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mario@example.it"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="cm-tags" className="mb-1 block text-[11.5px] font-medium text-slate-400">
              Tag (separati da virgola)
            </label>
            <input
              id="cm-tags"
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="vip, clienti, newsletter"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
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
              {saving ? "Salvataggio…" : contact ? "Salva" : "Crea contatto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
