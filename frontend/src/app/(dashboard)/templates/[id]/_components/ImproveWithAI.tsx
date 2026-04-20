"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Variant {
  style: "short" | "warm" | "professional";
  text: string;
}

interface Props {
  open: boolean;
  body: string;
  onClose: () => void;
  onApply: (text: string) => void;
}

const STYLE_LABELS: Record<Variant["style"], { title: string; desc: string }> = {
  short: { title: "Più breve", desc: "Conciso e diretto" },
  warm: { title: "Più caloroso", desc: "Relazionale e personale" },
  professional: { title: "Più formale", desc: "Istituzionale, neutro" },
};

export function ImproveWithAI({ open, body, onClose, onApply }: Props) {
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setVariants(null);
    setCached(false);
    setLoading(true);

    apiFetch("/templates/improve", {
      method: "POST",
      body: JSON.stringify({ body }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          const msg =
            r.status === 402
              ? "Limite mensile AI raggiunto o piano non abilitato."
              : (data.detail ?? `Errore ${r.status}`);
          setError(msg);
          return;
        }
        setVariants(data.variants);
        setCached(!!data.cached);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Errore di rete"))
      .finally(() => setLoading(false));
  }, [open, body]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            <span className="text-brand-teal">✨</span>
            Migliora con AI
            {cached && (
              <span className="rounded-pill bg-slate-800 px-2 py-0.5 text-[10px] font-normal text-slate-400">
                cached
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="rounded-sm p-1 text-slate-400 hover:bg-brand-navy-deep hover:text-slate-100"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div className="py-8 text-center text-[13px] text-slate-400">Generazione varianti…</div>
        )}

        {error && !loading && (
          <div className="rounded-sm bg-red-500/10 px-3 py-2 text-[12px] text-red-300 ring-1 ring-red-500/20">
            {error}
          </div>
        )}

        {variants && !loading && (
          <div className="grid gap-3 md:grid-cols-3">
            {variants.map((v) => (
              <div
                key={v.style}
                className="flex flex-col rounded-card border border-slate-800 bg-brand-navy-deep p-3"
              >
                <div className="mb-1">
                  <div className="text-[12px] font-semibold text-brand-teal">
                    {STYLE_LABELS[v.style].title}
                  </div>
                  <div className="text-[10.5px] text-slate-500">
                    {STYLE_LABELS[v.style].desc}
                  </div>
                </div>
                <div className="mb-3 flex-1 whitespace-pre-wrap text-[13px] text-slate-100">
                  {v.text}
                </div>
                <button
                  onClick={() => {
                    onApply(v.text);
                    onClose();
                  }}
                  className="rounded-pill bg-brand-teal/15 px-3 py-1.5 text-[12px] font-medium text-brand-teal hover:bg-brand-teal/25"
                >
                  Applica
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-pill border border-slate-800 px-4 py-2 text-[13px] text-slate-300 hover:border-slate-700 hover:text-slate-100"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
