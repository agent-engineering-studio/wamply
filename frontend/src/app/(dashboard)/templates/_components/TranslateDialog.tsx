"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import type { Language } from "@/lib/templates/types";

interface Props {
  open: boolean;
  templateId: string;
  templateName: string;
  sourceLanguage: Language;
  onClose: () => void;
}

interface TranslateResult {
  language: Language;
  ok: boolean;
  template_id?: string;
  name?: string;
  error?: string;
}

const LANGS: { value: Language; label: string; flag: string }[] = [
  { value: "it", label: "Italiano", flag: "🇮🇹" },
  { value: "en", label: "English", flag: "🇬🇧" },
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
];

export function TranslateDialog({
  open,
  templateId,
  templateName,
  sourceLanguage,
  onClose,
}: Props) {
  const [selected, setSelected] = useState<Language[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TranslateResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function toggle(lang: Language) {
    setSelected((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  }

  async function handleTranslate() {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/templates/${templateId}/translate`, {
        method: "POST",
        body: JSON.stringify({ target_languages: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          res.status === 402
            ? "Limite mensile AI raggiunto o piano non abilitato."
            : (data.detail ?? `Errore ${res.status}`)
        );
        return;
      }
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di rete");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setSelected([]);
    setResults(null);
    setError(null);
    setLoading(false);
    onClose();
  }

  const available = LANGS.filter((l) => l.value !== sourceLanguage);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
              <span className="text-brand-teal">🌐</span>
              Traduci template
            </h2>
            <p className="text-[11.5px] text-slate-500">
              "{templateName}" · lingua originale:{" "}
              <span className="uppercase">{sourceLanguage}</span>
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-sm p-1 text-slate-400 hover:bg-brand-navy-deep hover:text-slate-100"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        {!results && (
          <>
            <div className="text-[12px] text-slate-400">
              Scegli le lingue in cui creare una copia. Ogni traduzione sarà
              salvata come <strong className="text-slate-300">bozza</strong>{" "}
              (pending_review) — potrai rivederla prima dell&apos;approvazione.
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {available.map((l) => {
                const checked = selected.includes(l.value);
                return (
                  <label
                    key={l.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-[13px] transition ${
                      checked
                        ? "border-brand-teal bg-brand-teal/10 text-brand-teal"
                        : "border-slate-800 bg-brand-navy-deep text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(l.value)}
                      className="accent-brand-teal"
                      disabled={loading}
                    />
                    <span>{l.flag}</span>
                    <span>{l.label}</span>
                  </label>
                );
              })}
            </div>

            {error && (
              <div className="mt-3 rounded-sm bg-red-500/10 px-3 py-2 text-[12px] text-red-300 ring-1 ring-red-500/20">
                {error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={handleClose}
                disabled={loading}
                className="rounded-pill border border-slate-800 px-4 py-2 text-[13px] text-slate-300 hover:border-slate-700 hover:text-slate-100 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleTranslate}
                disabled={loading || selected.length === 0}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[13px] font-medium text-slate-950 hover:bg-brand-teal/90 disabled:opacity-50"
              >
                {loading ? "Traduzione…" : `Traduci (${selected.length})`}
              </button>
            </div>
          </>
        )}

        {results && (
          <>
            <div className="space-y-2">
              {results.map((r) => (
                <div
                  key={r.language}
                  className={`flex items-center justify-between rounded-sm border px-3 py-2 text-[12.5px] ${
                    r.ok
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="uppercase">{r.language}</span>
                    {r.ok ? (
                      <span className="text-slate-400">· {r.name}</span>
                    ) : (
                      <span className="text-slate-400">· {r.error}</span>
                    )}
                  </div>
                  {r.ok && r.template_id && (
                    <Link
                      href={`/templates/${r.template_id}`}
                      className="rounded-pill border border-slate-800 px-2.5 py-1 text-[11px] text-slate-200 hover:border-slate-700"
                    >
                      Apri
                    </Link>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleClose}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[13px] font-medium text-slate-950 hover:bg-brand-teal/90"
              >
                Chiudi
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
