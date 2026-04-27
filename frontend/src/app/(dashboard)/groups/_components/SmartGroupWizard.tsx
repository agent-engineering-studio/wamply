"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { CreditBadge } from "@/components/shared/CreditBadge";

interface Suggestion {
  name: string;
  description: string;
  filter_tags_any: string[];
  filter_tags_all: string[];
  filter_languages: string[];
  estimated_audience: number;
  real_audience: number;
  reasoning: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type Step = "describe" | "review";

const EXAMPLES = [
  "Clienti VIP che hanno già acquistato",
  "Lead freddi che non comprano da 3 mesi",
  "Contatti in lingua inglese iscritti alla newsletter",
];

export function SmartGroupWizard({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("describe");
  const [description, setDescription] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [editableName, setEditableName] = useState("");
  const [editableDesc, setEditableDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("describe");
      setDescription("");
      setSuggestion(null);
      setEditableName("");
      setEditableDesc("");
      setError(null);
      setLoading(false);
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
      const res = await apiFetch("/groups/suggest", {
        method: "POST",
        body: JSON.stringify({ description: description.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Analisi non disponibile.");
      setSuggestion(body as Suggestion);
      setEditableName(body.name || "");
      setEditableDesc(body.description || "");
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    if (!suggestion) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/groups", {
        method: "POST",
        body: JSON.stringify({
          name: editableName.trim(),
          description: editableDesc.trim(),
          filter: {
            tags_any: suggestion.filter_tags_any,
            tags_all: suggestion.filter_tags_all,
            languages: suggestion.filter_languages,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Creazione fallita.");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-hidden rounded-card border border-indigo-500/30 bg-brand-navy-light shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-linear-to-r from-indigo-500/10 to-brand-teal/5 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[14px] font-semibold text-slate-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-indigo-300">
                <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
                <path d="M19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
              </svg>
              Crea gruppo intelligente
            </div>
            <div className="mt-0.5 text-[11.5px] text-slate-400">
              Descrivi chi vuoi includere — l&apos;AI propone il filtro e calcola l&apos;audience.
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
          {step === "describe" && (
            <div className="space-y-3">
              <label className="block text-[11.5px] font-medium uppercase tracking-wider text-slate-400">
                Descrizione
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Es: clienti VIP di Milano con almeno un acquisto nell'ultimo trimestre"
                rows={4}
                maxLength={500}
                autoFocus
                className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
              />
              <div className="flex items-center justify-between text-[10.5px] text-slate-500">
                <span>{description.length}/500 · minimo 5 caratteri</span>
                <span className="rounded-pill bg-indigo-500/15 px-2 py-0.5 font-medium text-indigo-300">
                  2 crediti AI
                </span>
              </div>

              <div>
                <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-slate-500">
                  Esempi
                </div>
                <div className="space-y-1">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setDescription(ex)}
                      className="block w-full rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2 text-left text-[12px] text-slate-300 hover:border-indigo-500/40 hover:text-slate-100"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "review" && suggestion && (
            <div className="space-y-4">
              <div>
                <label htmlFor="grp-name" className="mb-1 block text-[11.5px] font-medium uppercase tracking-wider text-slate-400">
                  Nome gruppo
                </label>
                <input
                  id="grp-name"
                  type="text"
                  value={editableName}
                  onChange={(e) => setEditableName(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="grp-desc" className="mb-1 block text-[11.5px] font-medium uppercase tracking-wider text-slate-400">
                  Descrizione
                </label>
                <input
                  id="grp-desc"
                  type="text"
                  value={editableDesc}
                  onChange={(e) => setEditableDesc(e.target.value)}
                  maxLength={300}
                  className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div className="rounded-sm border border-slate-800 bg-brand-navy-deep p-3">
                <div className="text-[10.5px] uppercase tracking-wider text-indigo-300">
                  Filtro proposto
                </div>
                <div className="mt-2 space-y-1.5 text-[12px]">
                  {suggestion.filter_tags_any.length > 0 && (
                    <div>
                      <span className="text-slate-500">Tag (almeno uno):</span>{" "}
                      {suggestion.filter_tags_any.map((t) => (
                        <span key={t} className="mr-1 inline-block rounded-pill bg-indigo-500/15 px-2 py-0.5 text-[11px] text-indigo-300">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {suggestion.filter_tags_all.length > 0 && (
                    <div>
                      <span className="text-slate-500">Tag (tutti):</span>{" "}
                      {suggestion.filter_tags_all.map((t) => (
                        <span key={t} className="mr-1 inline-block rounded-pill bg-indigo-500/15 px-2 py-0.5 text-[11px] text-indigo-300">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {suggestion.filter_languages.length > 0 && (
                    <div>
                      <span className="text-slate-500">Lingue:</span>{" "}
                      {suggestion.filter_languages.map((l) => (
                        <span key={l} className="mr-1 inline-block rounded-pill bg-brand-teal/15 px-2 py-0.5 text-[11px] text-brand-teal">
                          {l}
                        </span>
                      ))}
                    </div>
                  )}
                  {suggestion.filter_tags_any.length === 0 &&
                    suggestion.filter_tags_all.length === 0 &&
                    suggestion.filter_languages.length === 0 && (
                      <div className="text-[11.5px] text-amber-300">
                        Nessun filtro applicabile — il gruppo includerebbe tutti i contatti opt-in.
                      </div>
                    )}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-sm border border-brand-teal/30 bg-brand-teal/10 px-3 py-2.5">
                <div className="text-[11.5px] text-slate-400">Audience reale dal database</div>
                <div className="text-[16px] font-semibold text-brand-teal">
                  {suggestion.real_audience.toLocaleString("it-IT")}
                </div>
              </div>

              <details className="rounded-sm border border-slate-800 bg-brand-navy-deep">
                <summary className="cursor-pointer px-3 py-2 text-[11.5px] font-medium text-indigo-300 hover:text-indigo-200">
                  Perché questo filtro?
                </summary>
                <div className="border-t border-slate-800 px-3 py-2 text-[11.5px] leading-relaxed text-slate-400">
                  {suggestion.reasoning}
                </div>
              </details>
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
            onClick={() => {
              if (step === "review") setStep("describe");
              else onClose();
            }}
            disabled={loading}
            className="rounded-pill px-3 py-1.5 text-[12px] text-slate-400 hover:text-slate-200 disabled:opacity-40"
          >
            {step === "describe" ? "Annulla" : "← Indietro"}
          </button>
          {step === "describe" ? (
            <button
              type="button"
              onClick={runSuggest}
              disabled={loading || description.trim().length < 5}
              className="flex items-center gap-2 rounded-pill bg-indigo-500 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              {loading ? "Analisi..." : "Analizza →"}
              {!loading && <CreditBadge operation="group_suggest" className="bg-white/20 text-white" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={create}
              disabled={loading || !editableName.trim()}
              className="rounded-pill bg-brand-teal px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-teal-dark disabled:opacity-40"
            >
              {loading ? "Creazione..." : "Crea gruppo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
