"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface SystemConfigEntry {
  is_set: boolean;
  updated_at: string | null;
}

interface SystemConfigResponse {
  config: Record<string, SystemConfigEntry>;
}

export function AISystemKeyTab() {
  const [entry, setEntry] = useState<SystemConfigEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await apiFetch("/settings/system");
      const data = (await res.json()) as SystemConfigResponse;
      setEntry(data.config?.default_anthropic_api_key ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setMessage({ type: "err", text: "Inserisci una chiave API valida." });
      return;
    }
    if (!trimmed.startsWith("sk-ant-")) {
      setMessage({ type: "err", text: "La chiave Anthropic deve iniziare con 'sk-ant-'." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch("/settings/system", {
        method: "POST",
        body: JSON.stringify({ default_anthropic_api_key: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setDraft("");
      setMessage({ type: "ok", text: "Chiave salvata e cifrata nel database." });
      await reload();
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Errore imprevisto" });
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!confirm("Rimuovere la chiave system? Gli utenti senza BYOK perderanno l'accesso all'AI.")) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch("/settings/system", {
        method: "POST",
        body: JSON.stringify({ default_anthropic_api_key: "" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage({ type: "ok", text: "Chiave system rimossa." });
      await reload();
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Errore imprevisto" });
    } finally {
      setSaving(false);
    }
  }

  const isSet = entry?.is_set ?? false;

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[10.5px] font-medium ${
              isSet
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-300"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isSet ? "bg-emerald-400" : "bg-amber-400"}`} />
            {isSet ? "Configurata" : "Non configurata"}
          </span>
          {entry?.updated_at && (
            <span className="text-[11px] text-slate-500">
              Aggiornata il{" "}
              {new Date(entry.updated_at).toLocaleString("it-IT", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        <h2 className="mb-1 text-[15px] font-semibold text-slate-100">
          Chiave Claude system
        </h2>
        <p className="mb-5 text-[12.5px] leading-relaxed text-slate-400">
          Questa è la chiave Anthropic condivisa che Wamply usa per gli utenti
          sui piani Professional/Enterprise che consumano crediti. Viene cifrata
          in <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-300">system_config</code>{" "}
          e non è mai visibile dopo il salvataggio. Gli utenti BYOK (con chiave
          propria in <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-300">ai_config</code>)
          continuano a usare la loro.
        </p>

        {loading ? (
          <div className="animate-pulse text-[12.5px] text-slate-500">Caricamento…</div>
        ) : (
          <>
            <label className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wider text-slate-400">
              {isSet ? "Sostituisci la chiave" : "Inserisci la chiave"}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="sk-ant-api03-..."
                autoComplete="off"
                spellCheck={false}
                className="flex-1 rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 font-mono text-[12.5px] text-slate-100 placeholder:text-slate-600 focus:border-brand-teal focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !draft.trim()}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white shadow-teal transition-colors hover:bg-brand-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Salvataggio…" : "Salva"}
              </button>
            </div>

            {isSet && (
              <button
                type="button"
                onClick={handleClear}
                disabled={saving}
                className="mt-3 text-[11.5px] text-rose-300 hover:text-rose-200 disabled:opacity-50"
              >
                Rimuovi chiave system
              </button>
            )}
          </>
        )}

        {message && (
          <div
            className={`mt-4 rounded-sm border px-3 py-2 text-[12px] ${
              message.type === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/30 bg-rose-500/10 text-rose-300"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
        <h3 className="mb-2 text-[13px] font-semibold text-slate-100">Come funziona il routing</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-slate-400">
          <li>
            Se l'utente ha impostato una <strong className="text-slate-200">BYOK</strong> in{" "}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-300">/settings/ai</code>, viene usata quella (nessun credito conteggiato).
          </li>
          <li>
            Altrimenti Wamply usa <strong className="text-slate-200">questa chiave system</strong>, scalando crediti sul piano dell'utente.
          </li>
          <li>
            Se nessuna delle due è configurata, le chiamate AI ricevono <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-300">402 Payment Required</code>.
          </li>
        </ol>
        <p className="mt-3 text-[11.5px] text-slate-500">
          La chiave è usata da chat agent, template AI (generate/improve/translate/compliance),
          campaign planner e personalization. Non è letta da variabili d'ambiente.
        </p>
      </div>
    </div>
  );
}
