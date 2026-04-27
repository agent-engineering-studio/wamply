"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

interface ImportResult {
  created: number;
  updated: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export function CsvImportModal({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset transient state every time the modal is opened so the user always
  // lands on a fresh upload form, never on the previous run's success card.
  useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  function handleClose() {
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  }

  function handleImportAnother() {
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

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
        let detail = err.detail;
        if (Array.isArray(detail)) {
          detail = detail
            .map((e) => `${(e.loc ?? []).join(".")}: ${e.msg ?? "errore"}`)
            .join(" | ");
        } else if (detail && typeof detail === "object") {
          detail = JSON.stringify(detail);
        }
        throw new Error(detail || `HTTP ${r.status}`);
      }
      const data: ImportResult = await r.json();
      // Backend may return only legacy `imported`; normalize so the UI
      // can always rely on `created`/`updated` being present.
      const total = data.imported ?? ((data.created ?? 0) + (data.updated ?? 0));
      setResult({
        created: data.created ?? total,
        updated: data.updated ?? 0,
        imported: total,
        skipped: data.skipped ?? 0,
        errors: data.errors ?? [],
      });
      if (total > 0) onImported();
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
                onClick={handleClose}
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
            <div className="rounded-card border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-emerald-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Importazione completata
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-sm bg-emerald-500/10 px-2 py-2">
                  <div className="text-[18px] font-semibold text-emerald-300">{result.created}</div>
                  <div className="text-[10.5px] uppercase tracking-wider text-emerald-400/80">Nuovi</div>
                </div>
                <div className="rounded-sm bg-amber-500/10 px-2 py-2">
                  <div className="text-[18px] font-semibold text-amber-300">{result.updated}</div>
                  <div className="text-[10.5px] uppercase tracking-wider text-amber-400/80">Aggiornati</div>
                </div>
                <div className="rounded-sm bg-slate-700/30 px-2 py-2">
                  <div className="text-[18px] font-semibold text-slate-300">{result.skipped}</div>
                  <div className="text-[10.5px] uppercase tracking-wider text-slate-400">Saltati</div>
                </div>
              </div>
              {result.updated > 0 && (
                <div className="mt-2 text-[11px] text-slate-400">
                  Gli aggiornamenti riguardano contatti già presenti (riconosciuti dal numero di telefono): nome, email, lingua e tag sono stati sovrascritti.
                </div>
              )}
            </div>
            {result.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-sm border border-rose-500/30 bg-rose-500/10 p-2">
                <div className="mb-1 text-[11px] font-semibold text-rose-300">Errori per riga</div>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-[11px] text-rose-300">{e}</p>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleImportAnother}
                className="rounded-pill border border-slate-700 px-4 py-2 text-[12.5px] font-medium text-slate-200 hover:border-brand-teal/50 hover:bg-brand-navy-deep hover:text-brand-teal"
              >
                Importa un altro CSV
              </button>
              <button
                type="button"
                onClick={handleClose}
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
