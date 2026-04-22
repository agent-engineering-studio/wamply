"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface QuickPrompt {
  label: string;
  prompt: string;
}

export interface PromptCategory {
  title: string;
  prompts: QuickPrompt[];
}

interface Props {
  categories: PromptCategory[];
  onPick: (prompt: string) => void;
}

/**
 * Searchable command-palette-style dropdown of quick prompts.
 *
 * Sits next to the chat input so it stays reachable after the first turn.
 * Click inserts the prompt into the input (caller decides) — it does NOT
 * auto-send, so users can edit [ID] placeholders before pressing Invia.
 *
 * Kbd: ⌘K / Ctrl+K opens, Esc closes, ↑↓ navigate, Enter picks.
 */
export function PromptPalette({ categories, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Flatten for navigation + filter by query on label/prompt/category.
  const flat = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { cat: string; item: QuickPrompt }[] = [];
    for (const cat of categories) {
      for (const p of cat.prompts) {
        if (!q) {
          out.push({ cat: cat.title, item: p });
          continue;
        }
        const hay = `${cat.title} ${p.label} ${p.prompt}`.toLowerCase();
        if (hay.includes(q)) out.push({ cat: cat.title, item: p });
      }
    }
    return out;
  }, [categories, query]);

  // Group filtered results back by category for the render.
  const grouped = useMemo(() => {
    const map = new Map<string, QuickPrompt[]>();
    for (const { cat, item } of flat) {
      const arr = map.get(cat) ?? [];
      arr.push(item);
      map.set(cat, arr);
    }
    return Array.from(map.entries());
  }, [flat]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      // Focus on next tick to survive the outside-click handler below.
      setTimeout(() => searchRef.current?.focus(), 10);
    }
  }, [open]);

  // Global shortcut: ⌘K / Ctrl+K.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Outside click closes.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep active index in range when filter shrinks.
  useEffect(() => {
    if (activeIdx >= flat.length) setActiveIdx(Math.max(0, flat.length - 1));
  }, [flat.length, activeIdx]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(flat.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter" && flat[activeIdx]) {
      e.preventDefault();
      pick(flat[activeIdx].item);
    }
  }

  function pick(p: QuickPrompt) {
    onPick(p.prompt);
    setOpen(false);
  }

  // Running index so we can match row i inside the grouped render.
  let running = -1;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Prompt rapidi (Ctrl+K)"
        aria-label="Apri prompt rapidi"
        className="flex items-center gap-1.5 rounded-pill border border-slate-700 bg-brand-navy-light px-3 py-2 text-[12.5px] font-medium text-slate-300 transition-colors hover:border-brand-teal hover:text-brand-teal"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
        <span className="hidden sm:inline">Prompt</span>
        <kbd className="hidden rounded-sm border border-slate-700 bg-brand-navy-deep px-1 py-0.5 font-mono text-[10px] text-slate-500 sm:inline">⌘K</kbd>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute bottom-full left-0 z-50 mb-2 w-md max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-slate-700 bg-brand-navy-deep shadow-xl"
        >
          {/* Search */}
          <div className="border-b border-slate-800 px-3 py-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Cerca un prompt…"
              className="w-full bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto py-1">
            {flat.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-slate-500">
                Nessun prompt trovato per &ldquo;{query}&rdquo;.
              </div>
            ) : (
              grouped.map(([catTitle, items]) => (
                <div key={catTitle} className="px-1 py-1">
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {catTitle}
                  </div>
                  {items.map((item) => {
                    running += 1;
                    const isActive = running === activeIdx;
                    const rowIdx = running;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => pick(item)}
                        onMouseEnter={() => setActiveIdx(rowIdx)}
                        className={`flex w-full flex-col items-start gap-0.5 rounded-sm px-3 py-1.5 text-left transition-colors ${
                          isActive ? "bg-brand-teal/15" : "hover:bg-brand-navy-light"
                        }`}
                      >
                        <span className={`text-[12.5px] font-medium ${isActive ? "text-brand-teal" : "text-slate-100"}`}>
                          {item.label}
                        </span>
                        <span className="truncate text-[11px] text-slate-500">
                          {item.prompt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between border-t border-slate-800 px-3 py-1.5 text-[10.5px] text-slate-500">
            <span>
              <kbd className="rounded-sm border border-slate-700 bg-brand-navy-light px-1 font-mono text-[9.5px]">↑↓</kbd>
              <span className="mx-1">nav</span>
              <kbd className="rounded-sm border border-slate-700 bg-brand-navy-light px-1 font-mono text-[9.5px]">↵</kbd>
              <span className="mx-1">inserisci</span>
              <kbd className="rounded-sm border border-slate-700 bg-brand-navy-light px-1 font-mono text-[9.5px]">Esc</kbd>
              <span className="ml-1">chiudi</span>
            </span>
            <span>{flat.length} {flat.length === 1 ? "prompt" : "prompts"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
