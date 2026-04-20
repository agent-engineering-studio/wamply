"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  componentsToForm,
  emptyForm,
  type Template,
  type TemplateFormState,
} from "@/lib/templates/types";
import { PreviewBubble } from "@/components/templates/PreviewBubble";
import { MetadataCard } from "./MetadataCard";

type State =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; template: Template; form: TemplateFormState };

export function TemplatePreview({ templateId }: { templateId: string | null }) {
  const [state, setState] = useState<State>({ kind: "empty" });

  useEffect(() => {
    if (!templateId) {
      setState({ kind: "empty" });
      return;
    }
    setState({ kind: "loading" });
    let cancelled = false;
    apiFetch(`/templates/${templateId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Template;
      })
      .then((template) => {
        if (cancelled) return;
        const form: TemplateFormState = {
          ...emptyForm(),
          name: template.name,
          language: template.language,
          category: template.category,
          ...componentsToForm(template.components ?? []),
        };
        setState({ kind: "ready", template, form });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  return (
    <section
      aria-label="Anteprima messaggio"
      aria-live="polite"
      className="lg:sticky lg:top-4"
    >
      {state.kind === "empty" && (
        <div
          role="status"
          className="rounded-card border border-dashed border-slate-800 bg-brand-navy-light p-8 text-center text-[12px] text-slate-500"
        >
          Seleziona un template per vedere l&apos;anteprima.
        </div>
      )}

      {state.kind === "loading" && (
        <div
          role="status"
          className="animate-pulse rounded-card border border-slate-800 bg-brand-navy-light p-8 text-center text-[12px] text-slate-500"
        >
          Caricamento anteprima...
        </div>
      )}

      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded-card border border-red-900/40 bg-red-950/30 p-4 text-[12px] text-red-300"
        >
          Impossibile caricare l&apos;anteprima.
        </div>
      )}

      {state.kind === "ready" && (
        <div>
          <PreviewBubble form={state.form} />
          <MetadataCard template={state.template} />
        </div>
      )}
    </section>
  );
}
