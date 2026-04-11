"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { FeatureGate } from "@/components/shared/FeatureGate";
import { UpgradePrompt } from "@/components/shared/UpgradePrompt";

interface AIData {
  mode: "shared" | "byok";
  api_key_set: boolean;
  api_key_masked: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
}

const MODELS = [
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (veloce)" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (bilanciato)" },
];

export function AIConfigForm() {
  const [data, setData] = useState<AIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [mode, setMode] = useState<"shared" | "byok">("shared");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-haiku-4-5-20251001");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(500);

  useEffect(() => {
    apiFetch("/settings/ai")
      .then((r) => r.json())
      .then((d: AIData) => {
        setData(d);
        setMode(d.mode);
        setModel(d.model);
        setTemperature(d.temperature);
        setMaxTokens(d.max_tokens);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const res = await apiFetch("/settings/ai", {
      method: "POST",
      body: JSON.stringify({
        mode,
        api_key: mode === "byok" ? apiKey || undefined : undefined,
        model,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    const result = await res.json();
    setSaving(false);

    if (result.success) {
      setMessage({ type: "success", text: "Configurazione AI salvata con successo." });
      setApiKey("");
    } else {
      setMessage({ type: "error", text: result.error ?? "Errore sconosciuto." });
    }
  }

  if (loading) {
    return <div className="animate-pulse rounded-xl bg-white p-8 text-slate-400">Caricamento...</div>;
  }

  return (
    <>
      {showUpgrade && (
        <UpgradePrompt
          message="La modalità BYOK (Bring Your Own Key) richiede il piano Professional o superiore."
          onClose={() => setShowUpgrade(false)}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6">
        {message && (
          <div className={`rounded-lg p-3 text-sm ${
            message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}>
            {message.text}
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Modalità</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode("shared")}
              className={`rounded-lg border px-4 py-2 text-sm ${
                mode === "shared"
                  ? "border-brand-green bg-brand-green/10 text-brand-green"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              Condivisa
            </button>
            <FeatureGate
              feature="byok_llm"
              fallback={
                <button
                  type="button"
                  onClick={() => setShowUpgrade(true)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-400"
                >
                  BYOK (Bring Your Own Key) 🔒
                </button>
              }
            >
              <button
                type="button"
                onClick={() => setMode("byok")}
                className={`rounded-lg border px-4 py-2 text-sm ${
                  mode === "byok"
                    ? "border-brand-green bg-brand-green/10 text-brand-green"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                BYOK (Bring Your Own Key)
              </button>
            </FeatureGate>
          </div>
        </div>

        {mode === "byok" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Chiave API Anthropic{" "}
              {data?.api_key_set && <span className="text-slate-400">({data.api_key_masked})</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={data?.api_key_set ? "Lascia vuoto per mantenere la chiave" : "sk-ant-..."}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Modello</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Temperatura: {temperature}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-brand-green"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>Preciso</span>
              <span>Creativo</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Max Token</label>
            <input
              type="number"
              min={50}
              max={4096}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-pill bg-brand-green px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-green/90 disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Salva Configurazione"}
        </button>
      </form>
    </>
  );
}
