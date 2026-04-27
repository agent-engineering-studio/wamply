"use client";

import { useRef, useState } from "react";
import type {
  TemplateFormState,
  Language,
  TemplateCategory,
  HeaderComponent,
  HeaderFormat,
  FooterComponent,
} from "@/lib/templates/types";
import { insertAtCursor } from "@/lib/templates/variables";
import { VariableToolbar } from "./VariableToolbar";
import { ButtonsEditor } from "./ButtonsEditor";
import { ImproveWithAI } from "./ImproveWithAI";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { apiFetch } from "@/lib/api-client";
import { CreditBadge } from "@/components/shared/CreditBadge";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
];
const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: "marketing", label: "Marketing" },
  { value: "utility", label: "Utility" },
  { value: "authentication", label: "Authentication" },
];

export function EditorForm({
  form,
  templateId,
  errors,
  onChange,
}: {
  form: TemplateFormState;
  templateId: string | null;
  errors: Record<string, string>;
  onChange: (next: TemplateFormState) => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const headerRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [improveOpen, setImproveOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { status: agent } = useAgentStatus();
  const aiEnabled = !!agent?.active;

  function insertIntoBody(token: string) {
    if (!bodyRef.current) return;
    const nextText = insertAtCursor(bodyRef.current, token);
    onChange({ ...form, body: { type: "BODY", text: nextText } });
  }

  function insertIntoHeader(token: string) {
    if (!headerRef.current || !form.header || form.header.format !== "TEXT") return;
    const nextText = insertAtCursor(headerRef.current, token);
    onChange({ ...form, header: { type: "HEADER", format: "TEXT", text: nextText } });
  }

  function toggleHeader() {
    const next: HeaderComponent | null = form.header
      ? null
      : { type: "HEADER", format: "TEXT", text: "" };
    onChange({ ...form, header: next });
  }

  function setHeaderFormat(fmt: HeaderFormat) {
    if (fmt === "TEXT") {
      onChange({ ...form, header: { type: "HEADER", format: "TEXT", text: "" } });
    } else {
      onChange({ ...form, header: { type: "HEADER", format: fmt, media_url: "" } });
    }
  }

  async function handleMediaUpload(file: File) {
    if (!templateId) {
      setUploadError("Salva prima il template per caricare un file.");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiFetch(`/templates/${templateId}/media`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${r.status}`);
      }
      const data = await r.json();
      onChange({
        ...form,
        header: { type: "HEADER", format: data.format, media_url: data.media_url },
      });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Errore upload.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggleFooter() {
    const next: FooterComponent | null = form.footer ? null : { type: "FOOTER", text: "" };
    onChange({ ...form, footer: next });
  }

  return (
    <div className="space-y-5">
      {/* Nome */}
      <div>
        <label className="mb-1 block text-[11.5px] font-medium text-slate-400">Nome template</label>
        <input
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          maxLength={80}
          placeholder="Es: Promo sconto estate"
          className="w-full rounded-sm border border-slate-800 bg-brand-navy-light px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none"
        />
        {errors.name && <div className="mt-1 text-[11px] text-red-600">{errors.name}</div>}
      </div>

      {/* Lingua + Categoria */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-slate-400">Lingua</label>
          <select
            value={form.language}
            onChange={(e) => onChange({ ...form, language: e.target.value as Language })}
            className="w-full rounded-sm border border-slate-800 bg-brand-navy-light px-3 py-2 text-[13px]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-slate-400">Categoria</label>
          <select
            value={form.category}
            onChange={(e) => onChange({ ...form, category: e.target.value as TemplateCategory })}
            className="w-full rounded-sm border border-slate-800 bg-brand-navy-light px-3 py-2 text-[13px]"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Header */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-slate-100">Header (opzionale)</span>
          <button
            type="button"
            onClick={toggleHeader}
            className="text-[11px] text-brand-teal hover:underline"
          >
            {form.header ? "Rimuovi" : "Aggiungi"}
          </button>
        </div>
        {form.header && (
          <div className="space-y-3">
            {/* Format selector — emoji + label, low IT-culture friendly */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { v: "TEXT", label: "Testo", icon: "Aa" },
                  { v: "IMAGE", label: "Immagine", icon: "🖼️" },
                  { v: "VIDEO", label: "Video", icon: "🎬" },
                  { v: "DOCUMENT", label: "PDF", icon: "📄" },
                ] as { v: HeaderFormat; label: string; icon: string }[]
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setHeaderFormat(opt.v)}
                  className={`flex items-center gap-1.5 rounded-pill px-3 py-1 text-[12px] font-medium transition-colors ${
                    form.header?.format === opt.v
                      ? "bg-brand-teal text-white"
                      : "border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            {form.header.format === "TEXT" ? (
              <>
                <input
                  ref={headerRef}
                  value={form.header.text}
                  maxLength={60}
                  onChange={(e) =>
                    onChange({ ...form, header: { type: "HEADER", format: "TEXT", text: e.target.value } })
                  }
                  placeholder="Testo header"
                  className="w-full rounded-sm border border-slate-800 bg-brand-navy-light px-3 py-2 text-[13px]"
                />
                <VariableToolbar onInsert={insertIntoHeader} />
                {errors["header.text"] && (
                  <div className="mt-1 text-[11px] text-red-600">{errors["header.text"]}</div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                {form.header.media_url ? (
                  <div className="space-y-2">
                    {form.header.format === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={form.header.media_url}
                        alt="Anteprima"
                        className="max-h-48 rounded-sm border border-slate-700 object-contain"
                      />
                    ) : (
                      <div className="rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-3 text-[12px] text-slate-300">
                        File caricato: <span className="font-mono text-slate-100">{form.header.media_url.split("/").pop()}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading || !templateId}
                      className="rounded-pill border border-slate-700 px-3 py-1 text-[11.5px] text-slate-300 hover:border-slate-500 disabled:opacity-40"
                    >
                      {uploading ? "Carico…" : "Sostituisci"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || !templateId}
                    className="flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-slate-700 bg-brand-navy-deep px-3 py-6 text-[12.5px] text-slate-400 transition-colors hover:border-brand-teal/50 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {uploading
                      ? "Caricamento…"
                      : !templateId
                        ? "Salva prima il template per caricare il file"
                        : "📎 Scegli un file dal tuo computer"}
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  aria-label="Carica file media per l'header"
                  title="Carica file media per l'header"
                  accept={
                    form.header.format === "IMAGE"
                      ? "image/png,image/jpeg,image/webp"
                      : form.header.format === "VIDEO"
                        ? "video/mp4,video/3gpp"
                        : "application/pdf"
                  }
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleMediaUpload(f);
                  }}
                />
                <p className="text-[10.5px] text-slate-500">
                  {form.header.format === "IMAGE" && "PNG, JPEG o WebP — max 16 MB"}
                  {form.header.format === "VIDEO" && "MP4 o 3GP — max 16 MB"}
                  {form.header.format === "DOCUMENT" && "PDF — max 16 MB"}
                </p>
                {uploadError && (
                  <div className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300">
                    {uploadError}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-slate-100">Corpo del messaggio *</span>
          <div className="flex items-center gap-2">
            {aiEnabled && (
              <button
                type="button"
                onClick={() => setImproveOpen(true)}
                disabled={!form.body.text.trim()}
                className="flex items-center gap-1.5 rounded-pill border border-brand-teal/40 bg-brand-teal/10 px-2.5 py-1 text-[11px] font-medium text-brand-teal hover:bg-brand-teal/15 disabled:opacity-40"
              >
                ✨ Migliora
                <CreditBadge operation="template_improve" />
              </button>
            )}
            <span className="text-[11px] text-slate-500">{form.body.text.length} / 1024</span>
          </div>
        </div>
        <textarea
          ref={bodyRef}
          value={form.body.text}
          maxLength={1024}
          rows={6}
          onChange={(e) => onChange({ ...form, body: { type: "BODY", text: e.target.value } })}
          placeholder="Ciao {{nome}}, ..."
          className="w-full rounded-sm border border-slate-800 bg-brand-navy-light px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none"
        />
        <VariableToolbar onInsert={insertIntoBody} />
        {errors["body.text"] && (
          <div className="mt-1 text-[11px] text-red-600">{errors["body.text"]}</div>
        )}
      </div>

      {/* Footer */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-slate-100">Footer (opzionale)</span>
          <button
            type="button"
            onClick={toggleFooter}
            className="text-[11px] text-brand-teal hover:underline"
          >
            {form.footer ? "Rimuovi" : "Aggiungi"}
          </button>
        </div>
        {form.footer && (
          <>
            <input
              value={form.footer.text}
              maxLength={60}
              onChange={(e) => onChange({ ...form, footer: { type: "FOOTER", text: e.target.value } })}
              placeholder="Testo footer"
              className="w-full rounded-sm border border-slate-800 bg-brand-navy-light px-3 py-2 text-[13px]"
            />
            {errors["footer.text"] && (
              <div className="mt-1 text-[11px] text-red-600">{errors["footer.text"]}</div>
            )}
          </>
        )}
      </div>

      {/* Buttons */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
        <div className="mb-2 text-[12.5px] font-medium text-slate-100">Bottoni (opzionale, max 3)</div>
        <ButtonsEditor
          buttons={form.buttons}
          errors={errors}
          onChange={(buttons) => onChange({ ...form, buttons })}
        />
      </div>

      <ImproveWithAI
        open={improveOpen}
        body={form.body.text}
        onClose={() => setImproveOpen(false)}
        onApply={(text) => onChange({ ...form, body: { type: "BODY", text } })}
      />
    </div>
  );
}
