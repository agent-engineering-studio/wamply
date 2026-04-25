"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateBusinessModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    user_email: "",
    legal_name: "",
    brand_name: "",
    vat_number: "",
    initial_status: "draft" as const,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.user_email.trim() || !form.legal_name.trim() || !form.brand_name.trim()) {
      setError("Email utente, ragione sociale e brand name sono obbligatori.");
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch("/admin/businesses/create", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail ?? `HTTP ${r.status}`);
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-card border border-slate-700 bg-brand-navy-light p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-slate-100">Crea pratica WhatsApp</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {error && (
          <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Email utente *
            </label>
            <input
              type="email"
              value={form.user_email}
              onChange={(e) => setForm({ ...form, user_email: e.target.value })}
              placeholder="cliente@esempio.it"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Ragione sociale *
            </label>
            <input
              type="text"
              value={form.legal_name}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              placeholder="Rossi Parrucchieri SRL"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Brand name *
            </label>
            <input
              type="text"
              value={form.brand_name}
              onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
              placeholder="Rossi Hair"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Partita IVA
            </label>
            <input
              type="text"
              value={form.vat_number}
              onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
              placeholder="IT12345678901"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Stato iniziale
            </label>
            <select
              value={form.initial_status}
              onChange={(e) => setForm({ ...form, initial_status: e.target.value as typeof form.initial_status })}
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 focus:border-brand-teal focus:outline-none"
            >
              <option value="draft">In preparazione</option>
              <option value="awaiting_docs">Attesa documenti</option>
              <option value="submitted_to_meta">Inviata a Meta</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-pill border border-slate-700 py-2 text-[12.5px] font-medium text-slate-300 hover:text-white">
              Annulla
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-pill bg-brand-teal py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50">
              {saving ? "Creazione…" : "Crea pratica"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
