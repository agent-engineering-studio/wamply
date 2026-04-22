"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface TagItem {
  contact_id: string;
  suggested_tags: string[];
}

interface Batch {
  items: TagItem[];
  note: string | null;
}

interface ContactPreview {
  id: string;
  name: string | null;
  phone: string;
  current_tags: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}

/**
 * Suggests tags for the 20 most-recently-created untagged contacts.
 * User confirms or skips per-contact, then bulk apply.
 */
export function SmartTagsModal({ open, onClose, onApplied }: Props) {
  const [step, setStep] = useState<"intro" | "review">("intro");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [previews, setPreviews] = useState<Map<string, ContactPreview>>(new Map());
  const [selected, setSelected] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("intro");
      setBatch(null);
      setPreviews(new Map());
      setSelected(new Map());
      setError(null);
      setLoading(false);
      setApplying(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function runSuggest() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/contacts/suggest-tags", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Suggerimenti non disponibili.");
      const b = body as Batch;
      setBatch(b);

      // Fetch minimal contact info for the UI preview
      const ids = b.items.map((i) => i.contact_id);
      const contactsRes = await apiFetch(`/contacts?page=1`);
      const contactsData = await contactsRes.json();
      const byId = new Map<string, ContactPreview>();
      for (const c of contactsData.contacts || []) {
        if (ids.includes(c.id)) {
          byId.set(c.id, {
            id: c.id,
            name: c.name,
            phone: c.phone,
            current_tags: c.tags || [],
          });
        }
      }
      setPreviews(byId);

      // Pre-select every suggested tag
      const sel = new Map<string, Set<string>>();
      for (const item of b.items) {
        sel.set(item.contact_id, new Set(item.suggested_tags));
      }
      setSelected(sel);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(contactId: string, tag: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(contactId) ?? []);
      if (set.has(tag)) set.delete(tag);
      else set.add(tag);
      next.set(contactId, set);
      return next;
    });
  }

  async function apply() {
    const items = Array.from(selected.entries())
      .map(([cid, tags]) => ({ contact_id: cid, tags: Array.from(tags) }))
      .filter((x) => x.tags.length > 0);

    if (items.length === 0) {
      setError("Seleziona almeno un tag da applicare, o chiudi.");
      return;
    }

    setApplying(true);
    setError(null);
    try {
      const res = await apiFetch("/contacts/apply-tags", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Applicazione fallita.");
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
      setApplying(false);
    }
  }

  const suggestedItems = batch?.items.filter((i) => i.suggested_tags.length > 0) ?? [];
  const totalSelected = Array.from(selected.values()).reduce((s, set) => s + set.size, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-card border border-indigo-500/30 bg-brand-navy-light shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-linear-to-r from-indigo-500/10 to-brand-teal/5 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[14px] font-semibold text-slate-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-indigo-300">
                <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
                <path d="M19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
              </svg>
              Suggerisci tag con AI
            </div>
            <div className="mt-0.5 text-[11.5px] text-slate-400">
              Claude Haiku analizza i contatti senza tag e propone etichette coerenti con il tuo vocabolario.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="shrink-0 rounded-sm p-1 text-slate-400 hover:bg-brand-navy-deep hover:text-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {step === "intro" && (
            <div className="space-y-3 text-[12.5px] text-slate-300">
              <p>
                Il wizard prende i <strong className="text-slate-100">20 contatti senza tag più recenti</strong>{" "}
                e propone tag sulla base del tuo vocabolario attuale.
              </p>
              <p>
                Controllerai ogni suggerimento prima di applicarlo. I contatti senza informazioni
                sufficienti vengono saltati automaticamente.
              </p>
              <div className="flex items-center gap-2 rounded-sm border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[12px] text-indigo-200">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Costa <strong>1 credito AI</strong> totale per il batch.
              </div>
            </div>
          )}

          {step === "review" && batch && (
            <div className="space-y-3">
              {batch.note && (
                <div className="rounded-sm border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[12px] text-indigo-200">
                  {batch.note}
                </div>
              )}

              {suggestedItems.length === 0 ? (
                <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-[12px] text-amber-200">
                  L&apos;AI non ha trovato tag sufficientemente sicuri per i contatti analizzati.
                  Prova ad aggiungere più informazioni (variables, lingua) oppure crea manualmente i tag.
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-slate-500">
                    {suggestedItems.length} contatti con suggerimenti — {totalSelected} tag selezionati
                  </div>
                  <div className="space-y-2">
                    {suggestedItems.map((item) => {
                      const preview = previews.get(item.contact_id);
                      const sel = selected.get(item.contact_id) ?? new Set();
                      return (
                        <div
                          key={item.contact_id}
                          className="rounded-sm border border-slate-800 bg-brand-navy-deep p-3"
                        >
                          <div className="mb-1.5 flex items-center justify-between">
                            <div>
                              <div className="text-[12.5px] font-medium text-slate-100">
                                {preview?.name || "Senza nome"}
                              </div>
                              <div className="font-mono text-[10.5px] text-slate-500">
                                {preview?.phone ?? item.contact_id}
                              </div>
                            </div>
                            {preview && preview.current_tags.length > 0 && (
                              <div className="flex flex-wrap justify-end gap-1">
                                {preview.current_tags.map((t) => (
                                  <span
                                    key={t}
                                    className="rounded-pill bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {item.suggested_tags.map((tag) => {
                              const on = sel.has(tag);
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => toggle(item.contact_id, tag)}
                                  className={`rounded-pill px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                                    on
                                      ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-500/40"
                                      : "bg-slate-800 text-slate-400 hover:text-slate-200"
                                  }`}
                                >
                                  {on && "✓ "}
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-800 bg-brand-navy-deep/50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading || applying}
            className="rounded-pill px-3 py-1.5 text-[12px] text-slate-400 hover:text-slate-200 disabled:opacity-40"
          >
            {step === "review" && totalSelected > 0 ? "Annulla" : "Chiudi"}
          </button>
          {step === "intro" ? (
            <button
              type="button"
              onClick={runSuggest}
              disabled={loading}
              className="rounded-pill bg-indigo-500 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              {loading ? "Analisi..." : "Avvia analisi (1 credito)"}
            </button>
          ) : (
            <button
              type="button"
              onClick={apply}
              disabled={applying || totalSelected === 0}
              className="rounded-pill bg-brand-teal px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-teal-dark disabled:opacity-40"
            >
              {applying ? "Applicazione..." : `Applica ${totalSelected} tag`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
