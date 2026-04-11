"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface AIConfig {
  mode: "shared" | "byok";
  has_api_key: boolean;
  model: string;
  temperature: number;
  max_tokens: number;
}

interface AgentStatus {
  active: boolean;
  reason: string;
  has_byok: boolean;
  plan_has_agent: boolean;
  system_key_set: boolean;
}

const MODELS = [
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (veloce)" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (bilanciato)" },
];

export function AIConfigForm() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-haiku-4-5-20251001");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(500);

  useEffect(() => {
    Promise.all([
      apiFetch("/settings/ai").then((r) => r.json()),
      apiFetch("/settings/agent-status").then((r) => r.json()),
    ]).then(([aiRes, statusRes]) => {
      const c = aiRes.config;
      setConfig(c);
      setModel(c.model);
      setTemperature(c.temperature);
      setMaxTokens(c.max_tokens);
      setAgentStatus(statusRes);
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const res = await apiFetch("/settings/ai", {
      method: "POST",
      body: JSON.stringify({
        mode: apiKey ? "byok" : "shared",
        api_key: apiKey || undefined,
        model,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    const result = await res.json();
    setSaving(false);

    if (result.success) {
      setMessage({ type: "success", text: "Configurazione AI salvata." });
      setApiKey("");
      // Refresh agent status
      const statusRes = await apiFetch("/settings/agent-status").then((r) => r.json());
      setAgentStatus(statusRes);
      setConfig((prev) => prev ? { ...prev, has_api_key: apiKey ? true : prev.has_api_key } : prev);
    } else {
      setMessage({ type: "error", text: result.detail || "Errore nel salvataggio." });
    }
  }

  async function handleRemoveKey() {
    setSaving(true);
    await apiFetch("/settings/ai", {
      method: "POST",
      body: JSON.stringify({ api_key: "", model, temperature, max_tokens: maxTokens }),
    });
    setSaving(false);
    setConfig((prev) => prev ? { ...prev, has_api_key: false } : prev);
    const statusRes = await apiFetch("/settings/agent-status").then((r) => r.json());
    setAgentStatus(statusRes);
    setMessage({ type: "success", text: "API Key rimossa." });
  }

  if (loading) {
    return <div className="animate-pulse rounded-xl bg-white p-8 text-brand-ink-30">Caricamento...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Agent Status Card */}
      {agentStatus && (
        <div className={`rounded-card border p-4 ${agentStatus.active ? "border-brand-teal/30 bg-brand-teal-pale" : "border-brand-ink-10 bg-brand-ink-05"}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${agentStatus.active ? "bg-brand-teal/20" : "bg-brand-ink-10"}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke={agentStatus.active ? "#0D9488" : "#94A3B8"} strokeWidth="2" className="h-5 w-5">
                <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1.27A7 7 0 015.27 19H4a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z" />
                <circle cx="9" cy="14" r="1" fill={agentStatus.active ? "#0D9488" : "#94A3B8"} />
                <circle cx="15" cy="14" r="1" fill={agentStatus.active ? "#0D9488" : "#94A3B8"} />
              </svg>
            </div>
            <div className="flex-1">
              <div className={`text-[13px] font-semibold ${agentStatus.active ? "text-brand-teal-dark" : "text-brand-ink-60"}`}>
                Agent AI {agentStatus.active ? "attivo" : "non disponibile"}
              </div>
              <div className="text-[11px] text-brand-ink-60">
                {agentStatus.active && agentStatus.reason === "byok" && "Usa la tua API Key personale"}
                {agentStatus.active && agentStatus.reason === "plan" && "Incluso nel tuo piano di abbonamento"}
                {!agentStatus.active && !agentStatus.plan_has_agent && "Il tuo piano non include l'agent AI. Inserisci la tua API Key Claude per attivarlo."}
                {!agentStatus.active && agentStatus.plan_has_agent && !agentStatus.system_key_set && "In attesa di configurazione da parte dell'amministratore."}
              </div>
            </div>
            <div className={`h-3 w-3 rounded-full ${agentStatus.active ? "bg-brand-teal" : "bg-brand-ink-30"}`} />
          </div>
        </div>
      )}

      {/* AI Config Form */}
      <form onSubmit={handleSubmit} className="space-y-5 rounded-card border border-brand-ink-10 bg-white p-6 shadow-card">
        {message && (
          <div className={`rounded-lg p-3 text-[12px] ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {message.text}
          </div>
        )}

        {/* API Key Section */}
        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">
            API Key Claude (Anthropic)
          </label>
          {config?.has_api_key ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-sm border border-brand-teal/30 bg-brand-teal-pale px-3 py-2 text-[12px] text-brand-teal-dark">
                sk-ant-•••••••••• (configurata)
              </div>
              <button type="button" onClick={handleRemoveKey} disabled={saving}
                className="rounded-sm border border-red-200 px-3 py-2 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                Rimuovi
              </button>
            </div>
          ) : (
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          )}
          <p className="mt-1 text-[10px] text-brand-ink-30">
            Inserisci la tua chiave per attivare l&apos;agent AI. La chiave viene criptata e non sarà mai visibile.
          </p>
        </div>

        {/* Model */}
        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">Modello</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none">
            {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {/* Temperature + Max Tokens */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">
              Temperatura: {temperature}
            </label>
            <input type="range" min="0" max="1" step="0.1" value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-brand-teal" />
            <div className="mt-1 flex justify-between text-[10px] text-brand-ink-30">
              <span>Preciso</span>
              <span>Creativo</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">Max Token</label>
            <input type="number" min={50} max={4096} value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none" />
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full rounded-pill bg-brand-teal py-2.5 text-[13px] font-medium text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50">
          {saving ? "Salvataggio..." : "Salva Configurazione"}
        </button>
      </form>
    </div>
  );
}
