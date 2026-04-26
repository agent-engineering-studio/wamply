"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import type { Template } from "@/lib/templates/types";
import { TemplateCard } from "./_components/TemplateCard";
import { GenerateWithAI } from "./_components/GenerateWithAI";
import { useAgentStatus } from "@/hooks/useAgentStatus";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const { status: agent } = useAgentStatus();
  const aiEnabled = !!agent?.active;

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
          <h1 className="text-[18px] font-semibold text-slate-100">Template</h1>
          <p className="mt-1 text-[11.5px] text-slate-400">I tuoi template WhatsApp riutilizzabili</p>
        </div>
        <div className="flex items-center gap-2">
          {aiEnabled && (
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="flex items-center gap-1.5 rounded-sm border border-brand-teal/40 bg-brand-teal/10 px-3 py-2 text-[13px] font-medium text-brand-teal hover:bg-brand-teal/15"
            >
              <span>✨</span> Genera con AI
            </button>
          )}
          <Link
            href="/templates/new"
            className="rounded-sm bg-brand-teal px-4 py-2 text-[13px] font-medium text-slate-950 shadow-[0_1px_4px_rgba(13,148,136,.3)] hover:bg-brand-teal/90"
          >
            + Nuovo template
          </Link>
        </div>
      </div>

      <GenerateWithAI open={aiOpen} onClose={() => setAiOpen(false)} />

      {error && (
        <div className="mb-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          {error}
        </div>
      )}

      {templates === null ? (
        <div className="animate-pulse text-slate-500">Caricamento...</div>
      ) : templates.length === 0 ? (
        <div className="rounded-card border border-dashed border-slate-800 bg-brand-navy-light p-10 text-center">
          <p className="text-[13px] text-slate-400">
            Non hai ancora creato template. Creane uno per iniziare a inviare campagne personalizzate.
          </p>
          <Link
            href="/templates/new"
            className="mt-4 inline-block rounded-sm bg-brand-teal px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-teal-dark"
          >
            Crea il tuo primo template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onDelete={handleDelete}
              onSynced={(id, sid) =>
                setTemplates((list) =>
                  list ? list.map((x) => (x.id === id ? { ...x, twilio_content_sid: sid } : x)) : list,
                )
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
