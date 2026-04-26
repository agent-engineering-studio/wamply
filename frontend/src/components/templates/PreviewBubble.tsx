"use client";

import { useState } from "react";
import { renderWithSamples } from "@/lib/templates/variables";
import type { TemplateFormState } from "@/lib/templates/types";

function highlight(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\{\{[a-z0-9_:-]+\}\}/gi;
  let lastIndex = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > lastIndex) parts.push(text.slice(lastIndex, start));
    parts.push(
      <span
        key={`${start}-${match[0]}`}
        className="rounded-sm bg-amber-100 px-1 text-amber-900"
      >
        {match[0]}
      </span>
    );
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function PreviewBubble({ form }: { form: TemplateFormState }) {
  const [showRendered, setShowRendered] = useState(false);

  const headerText = form.header && form.header.format === "TEXT" ? form.header.text : "";
  const headerMedia = form.header && form.header.format !== "TEXT" ? form.header : null;
  const bodyText = form.body.text;
  const footerText = form.footer?.text ?? "";
  const buttons = form.buttons;

  const renderText = (t: string) => (showRendered ? renderWithSamples(t) : null);

  return (
    <div className="sticky top-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
          Anteprima
        </span>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <input
            type="checkbox"
            checked={showRendered}
            onChange={(e) => setShowRendered(e.target.checked)}
            className="h-3 w-3"
          />
          Mostra con valori esempio
        </label>
      </div>

      <div className="rounded-card bg-[#ECE5DD] p-4">
        <div className="ml-auto max-w-[90%] rounded-lg bg-[#DCF8C6] px-3 py-2 shadow-sm">
          {form.header && headerText && (
            <div className="mb-1 text-[13px] font-semibold text-[#1F2937]">
              {showRendered ? renderText(headerText) : highlight(headerText)}
            </div>
          )}
          {headerMedia && headerMedia.media_url && (
            <div className="mb-1.5 overflow-hidden rounded-md bg-white">
              {headerMedia.format === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={headerMedia.media_url} alt="Header" className="max-h-48 w-full object-cover" />
              ) : (
                <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-[#1F2937]">
                  <span>{headerMedia.format === "VIDEO" ? "🎬" : "📄"}</span>
                  <span className="truncate">{headerMedia.media_url.split("/").pop()}</span>
                </div>
              )}
            </div>
          )}
          <div className="whitespace-pre-wrap text-[13px] leading-snug text-[#1F2937]">
            {showRendered ? (
              renderText(bodyText) || <span className="text-slate-500">Scrivi il corpo del messaggio...</span>
            ) : bodyText ? (
              highlight(bodyText)
            ) : (
              <span className="text-slate-500">Scrivi il corpo del messaggio...</span>
            )}
          </div>
          {form.footer && footerText && (
            <div className="mt-1 text-[11px] text-[#6B7280]">{footerText}</div>
          )}
        </div>

        {buttons.length > 0 && (
          <div className="ml-auto mt-1.5 max-w-[90%] space-y-1">
            {buttons.map((b, i) => (
              <div
                key={i}
                className="rounded-lg bg-brand-navy-light px-3 py-1.5 text-center text-[12.5px] font-medium text-[#1E88E5] shadow-sm"
              >
                {b.type === "URL" && "🔗 "}
                {b.type === "PHONE_NUMBER" && "📞 "}
                {b.text || <span className="text-slate-500">Testo bottone</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 text-right text-[11px] text-slate-500">
        {bodyText.length} / 1024
      </div>
    </div>
  );
}
