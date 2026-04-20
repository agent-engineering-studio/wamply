"use client";

import { useState } from "react";
import { BUILTIN_VARIABLE_OPTIONS, tagToken } from "@/lib/templates/variables";

export function VariableToolbar({
  onInsert,
}: {
  onInsert: (token: string) => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const [tagOpen, setTagOpen] = useState(false);

  function commitTag() {
    const token = tagToken(tagInput);
    if (token) onInsert(token);
    setTagInput("");
    setTagOpen(false);
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[10.5px] uppercase tracking-wider text-slate-500">Inserisci:</span>
      {BUILTIN_VARIABLE_OPTIONS.map((opt) => (
        <button
          key={opt.token}
          type="button"
          onClick={() => onInsert(opt.token)}
          className="rounded-pill border border-slate-800 bg-brand-navy-light px-2 py-0.5 text-[11px] text-slate-400 hover:border-brand-teal hover:text-brand-teal"
        >
          {opt.label}
        </button>
      ))}
      {tagOpen ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            aria-label="Nome del tag"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTag();
              } else if (e.key === "Escape") {
                setTagOpen(false);
                setTagInput("");
              }
            }}
            placeholder="nome tag"
            className="w-28 rounded-sm border border-slate-800 px-2 py-0.5 text-[11px] focus:border-brand-teal focus:outline-none"
          />
          <button
            type="button"
            onClick={commitTag}
            className="rounded-sm bg-brand-teal px-2 py-0.5 text-[11px] text-white hover:bg-brand-teal-dark"
          >
            OK
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setTagOpen(true)}
          className="rounded-pill border border-dashed border-slate-800 px-2 py-0.5 text-[11px] text-slate-400 hover:border-brand-teal hover:text-brand-teal"
        >
          + Tag
        </button>
      )}
    </div>
  );
}
