"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Contact {
  id: string;
  name: string | null;
  phone: string;
}

interface PreviewResult {
  contact_id: string;
  contact_name: string;
  ok: boolean;
  text?: string;
  error?: string;
}

interface Props {
  templateId: string | null;
  aiEnabled: boolean;
}

export function PersonalizationPreview({ templateId, aiEnabled }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [results, setResults] = useState<PreviewResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Grab a small sample of opt-in contacts for preview.
    apiFetch("/contacts?page=1")
      .then((r) => r.json())
      .then((d) => {
        const list: Contact[] = (d.contacts || []).slice(0, 3);
        setContacts(list);
      })
      .catch(() => {});
  }, []);

  // Reset preview when template changes.
  useEffect(() => {
    setResults(null);
    setError(null);
  }, [templateId]);

  if (!aiEnabled) return null;
  if (!templateId) return null;

  async function handleGenerate() {
    if (!templateId) return;
    if (contacts.length === 0) {
      setError("Nessun contatto disponibile per l'anteprima. Aggiungi almeno un contatto.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch("/campaigns/preview-personalization", {
      method: "POST",
      body: JSON.stringify({
        template_id: templateId,
        contact_ids: contacts.map((c) => c.id),
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.detail || "Errore durante la generazione dell'anteprima.");
      setLoading(false);
      return;
    }
    setResults(body.results || []);
    setLoading(false);
  }

  return (
    <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-slate-100">
            Anteprima personalizzazione AI
          </div>
          <div className="mt-0.5 text-[11.5px] text-slate-400">
            Wamply adatterà il template ad ogni destinatario. Genera un&apos;anteprima su{" "}
            {contacts.length || "…"} contatto{contacts.length === 1 ? "" : "i"} reali prima di lanciare.
          </div>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || contacts.length === 0}
          className="shrink-0 rounded-pill bg-brand-teal/15 px-3 py-1.5 text-[11.5px] font-semibold text-brand-teal hover:bg-brand-teal/25 disabled:opacity-40"
        >
          {loading ? "Generazione..." : results ? "Rigenera" : "Genera anteprima"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      )}

      {results && results.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {results.map((r) => (
            <div
              key={r.contact_id}
              className="rounded-sm border border-slate-800 bg-brand-navy-deep p-3"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-teal/20 text-[10px] font-semibold text-brand-teal">
                  {r.contact_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="text-[11.5px] font-medium text-slate-200">
                  {r.contact_name}
                </div>
              </div>
              {r.ok ? (
                <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-100">
                  {r.text}
                </div>
              ) : (
                <div className="text-[11.5px] text-rose-300">{r.error}</div>
              )}
            </div>
          ))}
          <div className="text-[10.5px] text-slate-500">
            Costo generazione: {(results.filter((r) => r.ok).length * 0.5).toFixed(1)} crediti
          </div>
        </div>
      )}
    </div>
  );
}
