"use client";

import Link from "next/link";
import { useState } from "react";
import type { Template, BodyComponent } from "@/lib/templates/types";

const CATEGORY_STYLES: Record<string, string> = {
  marketing: "bg-brand-green-pale text-brand-green-dark",
  utility: "bg-blue-50 text-blue-700",
  authentication: "bg-amber-50 text-amber-700",
};

export function TemplateCard({
  template,
  onDelete,
}: {
  template: Template;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const body = template.components.find((c): c is BodyComponent => c.type === "BODY");
  const preview = body?.text ?? "";
  const date = new Date(template.created_at).toLocaleDateString("it-IT");

  return (
    <div className="group relative rounded-card border border-brand-ink-10 bg-white p-4 shadow-card transition hover:shadow-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-brand-ink">{template.name}</div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`rounded-pill px-2 py-0.5 text-[10.5px] font-medium ${
                CATEGORY_STYLES[template.category] ?? "bg-brand-ink-05 text-brand-ink-60"
              }`}
            >
              {template.category}
            </span>
            <span className="text-[10.5px] uppercase tracking-wider text-brand-ink-30">
              {template.language}
            </span>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-sm p-1 text-brand-ink-30 hover:bg-brand-ink-05 hover:text-brand-ink"
            aria-label="Azioni"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-10 w-36 rounded-sm border border-brand-ink-10 bg-white py-1 shadow-card"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <Link
                href={`/templates/${template.id}`}
                className="block px-3 py-1.5 text-[12.5px] text-brand-ink hover:bg-brand-ink-05"
              >
                Modifica
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  if (confirm(`Eliminare il template "${template.name}"?`)) onDelete(template.id);
                }}
                className="block w-full px-3 py-1.5 text-left text-[12.5px] text-red-600 hover:bg-red-50"
              >
                Elimina
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mb-3 line-clamp-3 text-[12px] text-brand-ink-60">{preview}</p>

      <div className="flex items-center justify-between text-[11px] text-brand-ink-30">
        <span>Creato il {date}</span>
        <Link href={`/templates/${template.id}`} className="font-medium text-brand-teal-dark hover:underline">
          Modifica →
        </Link>
      </div>
    </div>
  );
}
