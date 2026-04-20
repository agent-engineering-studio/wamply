"use client";

import type { Template } from "@/lib/templates/types";
import { bodyLength, collectVariables } from "@/lib/templates/preview-meta";

const CATEGORY_STYLES: Record<string, string> = {
  marketing: "bg-brand-navy-light text-brand-teal",
  utility: "bg-blue-50 text-blue-700",
  authentication: "bg-amber-50 text-amber-700",
};

export function MetadataCard({ template }: { template: Template }) {
  const len = bodyLength(template.components);
  const vars = collectVariables(template.components);

  return (
    <div className="mt-3 rounded-card border border-slate-800 bg-brand-navy-light p-3">
      <div className="text-[13px] font-semibold text-slate-100">{template.name}</div>

      <div className="mt-1.5 flex items-center gap-2">
        <span
          className={`rounded-pill px-2 py-0.5 text-[10.5px] font-medium ${
            CATEGORY_STYLES[template.category] ?? "bg-brand-navy-deep text-slate-400"
          }`}
        >
          {template.category}
        </span>
        <span className="rounded-pill bg-brand-navy-deep px-2 py-0.5 text-[10.5px] uppercase tracking-wider text-slate-400">
          {template.language}
        </span>
      </div>

      <dl className="mt-3 space-y-1.5 text-[11.5px]">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Lunghezza corpo</dt>
          <dd className="text-slate-200">{len} / 1024 caratteri</dd>
        </div>
        <div className="flex items-start justify-between gap-2">
          <dt className="shrink-0 text-slate-500">Variabili</dt>
          <dd className="text-right text-slate-200">
            {vars.length === 0 ? (
              <span className="text-slate-500">Nessuna variabile</span>
            ) : (
              <span className="inline-flex flex-wrap justify-end gap-1">
                {vars.map((v) => (
                  <code
                    key={v}
                    className="rounded-sm bg-brand-navy-deep px-1.5 py-0.5 text-[10.5px] text-brand-teal"
                  >
                    {`{{${v}}}`}
                  </code>
                ))}
              </span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Destinatari</dt>
          <dd className="text-slate-200">
            Verrà inviata a <span className="font-semibold">—</span> destinatari
          </dd>
        </div>
      </dl>
    </div>
  );
}
