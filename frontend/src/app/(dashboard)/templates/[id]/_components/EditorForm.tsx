"use client";

import { useRef } from "react";
import type {
  TemplateFormState,
  Language,
  TemplateCategory,
  HeaderComponent,
  FooterComponent,
} from "@/lib/templates/types";
import { insertAtCursor } from "@/lib/templates/variables";
import { VariableToolbar } from "./VariableToolbar";
import { ButtonsEditor } from "./ButtonsEditor";

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
  errors,
  onChange,
}: {
  form: TemplateFormState;
  errors: Record<string, string>;
  onChange: (next: TemplateFormState) => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const headerRef = useRef<HTMLInputElement>(null);

  function insertIntoBody(token: string) {
    if (!bodyRef.current) return;
    const nextText = insertAtCursor(bodyRef.current, token);
    onChange({ ...form, body: { type: "BODY", text: nextText } });
  }

  function insertIntoHeader(token: string) {
    if (!headerRef.current || !form.header) return;
    const nextText = insertAtCursor(headerRef.current, token);
    onChange({ ...form, header: { type: "HEADER", format: "TEXT", text: nextText } });
  }

  function toggleHeader() {
    const next: HeaderComponent | null = form.header
      ? null
      : { type: "HEADER", format: "TEXT", text: "" };
    onChange({ ...form, header: next });
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
        )}
      </div>

      {/* Body */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-slate-100">Corpo del messaggio *</span>
          <span className="text-[11px] text-slate-500">{form.body.text.length} / 1024</span>
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
    </div>
  );
}
