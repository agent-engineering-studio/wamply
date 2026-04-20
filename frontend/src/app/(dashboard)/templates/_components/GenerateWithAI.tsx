"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface GenerateResponse {
  id: string;
  name: string;
  language: string;
  category: string;
  generated_body?: string;
  generated_variables?: string[];
}

interface ErrorResponse {
  detail?: string;
  error?: string;
}

export function GenerateWithAI({ open, onClose }: Props) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("it");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleGenerate() {
    setError(null);
    setPreview(null);
    setLoading(true);
    try {
      const res = await apiFetch("/templates/generate", {
        method: "POST",
        body: JSON.stringify({ prompt, language }),
      });
      const data = (await res.json()) as GenerateResponse & ErrorResponse;
      if (!res.ok) {
        const msg =
          res.status === 402
            ? "Questa funzione richiede il piano Professional o Enterprise."
            : (data.detail ?? data.error ?? `Errore ${res.status}`);
        setError(msg);
        return;
      }
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di rete");
    } finally {
      setLoading(false);
    }
  }

  function handleEditInEditor() {
    if (preview) router.push(`/templates/${preview.id}`);
  }

  function handleClose() {
    setPrompt("");
    setPreview(null);
    setError(null);
    setLoading(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-xl rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            <span className="text-brand-teal">✨</span>
            Genera template con AI
          </h2>
          <button
            onClick={handleClose}
            className="rounded-sm p-1 text-slate-400 hover:bg-brand-navy-deep hover:text-slate-100"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        {!preview && (
          <>
            <label className="mb-1 block text-[12px] font-medium text-slate-400">
              Descrivi il template che vuoi creare
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
              rows={4}
              placeholder="Es: Reminder appuntamento 24h prima, includi nome cliente e data"
              className="w-full rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none"
              disabled={loading}
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>{prompt.length} / 500</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={loading}
                className="rounded-sm border border-slate-800 bg-brand-navy-deep px-2 py-1"
              >
                <option value="it">Italiano</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
              </select>
            </div>

            {error && (
              <div className="mt-3 rounded-sm bg-red-500/10 px-3 py-2 text-[12px] text-red-300 ring-1 ring-red-500/20">
                {error}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={handleClose}
                disabled={loading}
                className="rounded-pill border border-slate-800 px-4 py-2 text-[13px] text-slate-300 hover:border-slate-700 hover:text-slate-100 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || loading}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[13px] font-medium text-slate-950 hover:bg-brand-teal/90 disabled:opacity-50"
              >
                {loading ? "Generazione…" : "Genera"}
              </button>
            </div>
          </>
        )}

        {preview && (
          <>
            <div className="mb-3 rounded-sm bg-brand-teal/10 px-3 py-2 text-[12px] text-brand-teal ring-1 ring-brand-teal/20">
              Template generato e salvato come bozza.
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[11px] text-slate-500">Nome</div>
                <div className="text-[14px] font-medium text-slate-100">{preview.name}</div>
              </div>
              <div className="flex gap-4">
                <div>
                  <div className="text-[11px] text-slate-500">Categoria</div>
                  <div className="text-[13px] text-slate-100">{preview.category}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Lingua</div>
                  <div className="text-[13px] uppercase text-slate-100">{preview.language}</div>
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] text-slate-500">Corpo</div>
                <div className="whitespace-pre-wrap rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100">
                  {preview.generated_body}
                </div>
              </div>
              {preview.generated_variables && preview.generated_variables.length > 0 && (
                <div>
                  <div className="mb-1 text-[11px] text-slate-500">Variabili</div>
                  <div className="flex flex-wrap gap-1">
                    {preview.generated_variables.map((v) => (
                      <span
                        key={v}
                        className="rounded-pill bg-brand-teal/15 px-2 py-0.5 text-[11px] text-brand-teal"
                      >
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="rounded-pill border border-slate-800 px-4 py-2 text-[13px] text-slate-300 hover:border-slate-700 hover:text-slate-100"
              >
                Chiudi
              </button>
              <button
                onClick={handleEditInEditor}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[13px] font-medium text-slate-950 hover:bg-brand-teal/90"
              >
                Modifica nell'editor
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
