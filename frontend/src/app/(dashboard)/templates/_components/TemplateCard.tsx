"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Template } from "@/lib/templates/types";
import { bodyText } from "@/lib/templates/preview-meta";
import { TranslateDialog } from "./TranslateDialog";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { apiFetch } from "@/lib/api-client";

const CATEGORY_STYLES: Record<string, string> = {
  marketing: "bg-brand-navy-light text-brand-teal",
  utility: "bg-blue-50 text-blue-700",
  authentication: "bg-amber-50 text-amber-700",
};

export function TemplateCard({
  template,
  onDelete,
  onSynced,
}: {
  template: Template;
  onDelete: (id: string) => void;
  onSynced?: (id: string, sid: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const preview = bodyText(template.components);
  const { status: agent } = useAgentStatus();
  const aiEnabled = !!agent?.active;
  const date = new Date(template.created_at).toLocaleDateString("it-IT");
  const needsSync = !template.twilio_content_sid;

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const r = await apiFetch(`/templates/${template.id}/sync-to-twilio`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${r.status}`);
      }
      const data = await r.json();
      onSynced?.(template.id, data.twilio_content_sid);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Errore nella sincronizzazione.");
    } finally {
      setSyncing(false);
      setMenuOpen(false);
    }
  }

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
            {needsSync && (
              <span
                title="Non sincronizzato con Twilio: non utilizzabile per invii"
                className="rounded-pill bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300"
              >
                ⚠ Twilio
              </span>
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
                onClick={handleSync}
                disabled={syncing}
                className={`block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-brand-navy-deep disabled:opacity-50 ${
                  needsSync ? "text-amber-300" : "text-slate-300"
                }`}
                title={needsSync ? "Registra il template su Twilio" : "Ricrea il Content SID con il body attuale"}
              >
                {syncing
                  ? "Sincronizzo…"
                  : needsSync
                    ? "🔄 Sincronizza con Twilio"
                    : "🔄 Ri-sincronizza con Twilio"}
              </button>
              {aiEnabled && (
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
              )}
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

      {syncError && (
        <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">
          {syncError}
        </div>
      )}

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
