"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import type { Template } from "@/lib/templates/types";
import { TemplateCard } from "./_components/TemplateCard";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/templates")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Errore ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setTemplates(data.templates ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(id: string) {
    let snapshot: Template[] | null = null;
    setTemplates((t) => {
      snapshot = t;
      return t ? t.filter((x) => x.id !== id) : t;
    });
    try {
      const res = await apiFetch(`/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Errore ${res.status}`);
    } catch {
      setTemplates(snapshot);
      alert("Errore durante l'eliminazione del template.");
    }
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-brand-ink">Template</h1>
          <p className="mt-1 text-[11.5px] text-brand-ink-60">I tuoi template WhatsApp riutilizzabili</p>
        </div>
        <Link
          href="/templates/new"
          className="rounded-sm bg-brand-green px-4 py-2 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(37,211,102,.3)] hover:bg-brand-green-dark"
        >
          + Nuovo template
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          {error}
        </div>
      )}

      {templates === null ? (
        <div className="animate-pulse text-brand-ink-30">Caricamento...</div>
      ) : templates.length === 0 ? (
        <div className="rounded-card border border-dashed border-brand-ink-10 bg-white p-10 text-center">
          <p className="text-[13px] text-brand-ink-60">
            Non hai ancora creato template. Creane uno per iniziare a inviare campagne personalizzate.
          </p>
          <Link
            href="/templates/new"
            className="mt-4 inline-block rounded-sm bg-brand-green px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-green-dark"
          >
            Crea il tuo primo template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </>
  );
}
