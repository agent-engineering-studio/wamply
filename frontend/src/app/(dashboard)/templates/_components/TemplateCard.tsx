"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Template, BodyComponent } from "@/lib/templates/types";
import { TranslateDialog } from "./TranslateDialog";

const CATEGORY_STYLES: Record<string, string> = {
  marketing: "bg-brand-navy-light text-brand-teal",
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
  const [translateOpen, setTranslateOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const body = template.components.find((c): c is BodyComponent => c.type === "BODY");
  const preview = body?.text ?? "";
  const date = new Date(template.created_at).toLocaleDateString("it-IT");

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="group relative rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card transition hover:shadow-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-slate-100">{template.name}</div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`rounded-pill px-2 py-0.5 text-[10.5px] font-medium ${
                CATEGORY_STYLES[template.category] ?? "bg-brand-navy-deep text-slate-400"
              }`}
            >
              {template.category}
            </span>
            <span className="text-[10.5px] uppercase tracking-wider text-slate-500">
              {template.language}
            </span>
            {template.compliance_report && (
              <span
                title={`Conformità: ${Math.round(template.compliance_report.score * 100)}%`}
                className={`inline-block h-2 w-2 rounded-full ${
                  template.compliance_report.risk_level === "low"
                    ? "bg-emerald-400"
                    : template.compliance_report.risk_level === "medium"
                    ? "bg-amber-400"
                    : "bg-red-400"
                }`}
              />
            )}
          </div>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-sm p-1 text-slate-500 hover:bg-brand-navy-deep hover:text-slate-100"
            aria-label="Azioni"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-7 z-10 w-36 rounded-sm border border-slate-800 bg-brand-navy-light py-1 shadow-card"
            >
              <Link
                href={`/templates/${template.id}`}
                className="block px-3 py-1.5 text-[12.5px] text-slate-100 hover:bg-brand-navy-deep"
              >
                Modifica
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setTranslateOpen(true);
                }}
                className="block w-full px-3 py-1.5 text-left text-[12.5px] text-brand-teal hover:bg-brand-navy-deep"
              >
                🌐 Traduci…
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  if (confirm(`Eliminare il template "${template.name}"?`)) onDelete(template.id);
                }}
                className="block w-full px-3 py-1.5 text-left text-[12.5px] text-red-400 hover:bg-red-500/10"
              >
                Elimina
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mb-3 line-clamp-3 text-[12px] text-slate-400">{preview}</p>

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>Creato il {date}</span>
        <Link href={`/templates/${template.id}`} className="font-medium text-brand-teal hover:underline">
          Modifica →
        </Link>
      </div>

      <TranslateDialog
        open={translateOpen}
        templateId={template.id}
        templateName={template.name}
        sourceLanguage={template.language}
        onClose={() => setTranslateOpen(false)}
      />
    </div>
  );
}
