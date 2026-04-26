"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export function CsvImportModal({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Seleziona un file CSV."); return; }
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await apiFetch("/contacts/import", { method: "POST", body: form });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      const data: ImportResult = await r.json();
      setResult(data);
      if (data.imported > 0) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante l'importazione.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-card">
        <h2 className="mb-4 text-[15px] font-semibold text-slate-100">Importa contatti CSV</h2>

        {!result && (
          <>
            <p className="mb-3 text-[12px] text-slate-400">
              Il CSV deve avere almeno la colonna <code className="rounded bg-slate-800 px-1 text-brand-teal">phone</code>.
              Colonne opzionali: <code className="rounded bg-slate-800 px-1 text-slate-300">name, email, tags, language, city</code>.
            </p>
            <a
              href="/templates/contatti-wamply.csv"
              download="contatti-wamply.csv"
              className="mb-4 flex items-center gap-1.5 text-[12px] text-brand-teal hover:underline"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Scarica template
            </a>
            {error && (
              <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                {error}
              </div>
            )}
            <label htmlFor="csv-file-input" className="mb-1 block text-[11.5px] font-medium text-slate-400">
              Seleziona file CSV
            </label>
            <input
              id="csv-file-input"
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="mb-4 w-full text-[12px] text-slate-300 file:mr-3 file:rounded-pill file:border-0 file:bg-brand-teal/20 file:px-3 file:py-1.5 file:text-[11.5px] file:font-medium file:text-brand-teal"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-pill border border-slate-700 px-4 py-2 text-[12.5px] font-medium text-slate-300 hover:border-slate-600"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={uploading}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50"
              >
                {uploading ? "Importazione…" : "Importa"}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-300">
              <strong>{result.imported} contatti importati</strong>
              {result.skipped > 0 && <span className="ml-2 text-[12px] text-slate-400">({result.skipped} saltati)</span>}
            </div>
            {result.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-sm border border-slate-700 bg-brand-navy-deep p-2">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-[11px] text-rose-300">{e}</p>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark"
              >
                Chiudi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
