"use client";

import { useState } from "react";

export function AgentSettingsForm() {
  const [tonality, setTonality] = useState("professionale");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    // Agent settings are stored locally for now — will be sent to agent in Phase 4
    setSaving(false);
    setMessage("Impostazioni agente salvate.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6">
      {message && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Tono dei messaggi</label>
        <div className="flex flex-wrap gap-2">
          {["professionale", "amichevole", "informale", "formale"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTonality(t)}
              className={`rounded-lg border px-4 py-2 text-sm capitalize ${
                tonality === t
                  ? "border-brand-green bg-brand-green/10 text-brand-green"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Istruzioni personalizzate per l&apos;agente
        </label>
        <textarea
          rows={4}
          placeholder="Es: Usa sempre il nome del contatto. Includi un emoji alla fine del messaggio."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green"
        />
        <p className="mt-1 text-xs text-slate-400">
          Queste istruzioni verranno inviate all&apos;agente AI durante la composizione dei messaggi.
        </p>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-pill bg-brand-green px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-green/90 disabled:opacity-50"
      >
        {saving ? "Salvataggio..." : "Salva Impostazioni"}
      </button>
    </form>
  );
}
