"use client";

import type { TemplateButton, ButtonType } from "@/lib/templates/types";

const BUTTON_TYPE_LABELS: Record<ButtonType, string> = {
  QUICK_REPLY: "Quick reply",
  URL: "URL",
  PHONE_NUMBER: "Telefono",
};

export function ButtonsEditor({
  buttons,
  errors,
  onChange,
}: {
  buttons: TemplateButton[];
  errors: Record<string, string>;
  onChange: (next: TemplateButton[]) => void;
}) {
  function update(idx: number, patch: Partial<TemplateButton>) {
    const next = buttons.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    onChange(next);
  }

  function remove(idx: number) {
    onChange(buttons.filter((_, i) => i !== idx));
  }

  function add() {
    if (buttons.length >= 3) return;
    onChange([...buttons, { type: "QUICK_REPLY", text: "" }]);
  }

  return (
    <div className="space-y-3">
      {buttons.map((b, idx) => (
        <div key={idx} className="rounded-sm border border-slate-800 bg-brand-navy-deep p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-slate-400">Bottone {idx + 1}</span>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-[11px] text-red-600 hover:underline"
            >
              Rimuovi
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10.5px] font-medium text-slate-400">Tipo</label>
              <select
                value={b.type}
                onChange={(e) => update(idx, { type: e.target.value as ButtonType })}
                className="w-full rounded-sm border border-slate-800 bg-brand-navy-light px-2 py-1.5 text-[12.5px]"
              >
                <option value="QUICK_REPLY">{BUTTON_TYPE_LABELS.QUICK_REPLY}</option>
                <option value="URL">{BUTTON_TYPE_LABELS.URL}</option>
                <option value="PHONE_NUMBER">{BUTTON_TYPE_LABELS.PHONE_NUMBER}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] font-medium text-slate-400">Testo</label>
              <input
                value={b.text}
                maxLength={25}
                onChange={(e) => update(idx, { text: e.target.value })}
                className="w-full rounded-sm border border-slate-800 bg-brand-navy-light px-2 py-1.5 text-[12.5px]"
              />
              {errors[`buttons.${idx}.text`] && (
                <div className="mt-0.5 text-[10.5px] text-red-600">{errors[`buttons.${idx}.text`]}</div>
              )}
            </div>
          </div>

          {b.type === "URL" && (
            <div className="mt-2">
              <label className="mb-1 block text-[10.5px] font-medium text-slate-400">URL</label>
              <input
                value={b.url ?? ""}
                onChange={(e) => update(idx, { url: e.target.value })}
                placeholder="https://esempio.it"
                className="w-full rounded-sm border border-slate-800 bg-brand-navy-light px-2 py-1.5 text-[12.5px]"
              />
              {errors[`buttons.${idx}.url`] && (
                <div className="mt-0.5 text-[10.5px] text-red-600">{errors[`buttons.${idx}.url`]}</div>
              )}
            </div>
          )}
          {b.type === "PHONE_NUMBER" && (
            <div className="mt-2">
              <label className="mb-1 block text-[10.5px] font-medium text-slate-400">Telefono</label>
              <input
                value={b.phone_number ?? ""}
                onChange={(e) => update(idx, { phone_number: e.target.value })}
                placeholder="+393331234567"
                className="w-full rounded-sm border border-slate-800 bg-brand-navy-light px-2 py-1.5 text-[12.5px]"
              />
              {errors[`buttons.${idx}.phone_number`] && (
                <div className="mt-0.5 text-[10.5px] text-red-600">{errors[`buttons.${idx}.phone_number`]}</div>
              )}
            </div>
          )}
        </div>
      ))}

      {buttons.length < 3 && (
        <button
          type="button"
          onClick={add}
          className="w-full rounded-sm border border-dashed border-slate-800 py-2 text-[12px] text-slate-400 hover:border-brand-teal hover:text-brand-teal"
        >
          + Aggiungi bottone
        </button>
      )}
      {errors.buttons && (
        <div className="text-[11px] text-red-600">{errors.buttons}</div>
      )}
    </div>
  );
}
