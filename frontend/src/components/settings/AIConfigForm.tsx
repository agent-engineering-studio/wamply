"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface AIConfig {
  has_api_key: boolean;
  agent_tone: string;
  agent_instructions: string;
}

interface AgentStatus {
  active: boolean;
  reason: string;
  has_byok: boolean;
  plan_has_agent: boolean;
  system_key_set: boolean;
}

const TONES: Array<{ value: string; label: string }> = [
  { value: "professionale", label: "Professionale" },
  { value: "amichevole", label: "Amichevole" },
  { value: "informale", label: "Informale" },
  { value: "formale", label: "Formale" },
];

const MAX_INSTRUCTIONS = 1000;

export function AIConfigForm() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [tone, setTone] = useState<string>("professionale");
  const [instructions, setInstructions] = useState<string>("");

  useEffect(() => {
    Promise.all([
      apiFetch("/settings/ai").then((r) => r.json()),
      apiFetch("/settings/agent-status").then((r) => r.json()),
    ]).then(([aiRes, statusRes]) => {
      const c: AIConfig = aiRes.config;
      setConfig(c);
      setTone(c.agent_tone || "professionale");
      setInstructions(c.agent_instructions || "");
      setAgentStatus(statusRes);
      setLoading(false);
    });
  }, []);

  async function refresh() {
    const [aiRes, statusRes] = await Promise.all([
      apiFetch("/settings/ai").then((r) => r.json()),
      apiFetch("/settings/agent-status").then((r) => r.json()),
    ]);
    setConfig(aiRes.config);
    setAgentStatus(statusRes);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const payload: Record<string, unknown> = {
      agent_tone: tone,
      agent_instructions: instructions.trim(),
    };
    if (apiKey.trim()) payload.api_key = apiKey.trim();

    const res = await apiFetch("/settings/ai", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    setSaving(false);

    if (res.ok && result.success) {
      setMessage({ type: "success", text: "Impostazioni salvate." });
      setApiKey("");
      await refresh();
    } else {
      setMessage({ type: "error", text: result.detail || "Errore nel salvataggio." });
    }
  }

  async function handleRemoveKey() {
    if (!confirm("Rimuovere la tua API Key Claude? Se il tuo piano include l'AI continuerai ad usarla tramite la chiave condivisa di Wamply.")) return;
    setSaving(true);
    const res = await apiFetch("/settings/ai", {
      method: "POST",
      body: JSON.stringify({
        api_key: "",
        agent_tone: tone,
        agent_instructions: instructions.trim(),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage({ type: "success", text: "API Key rimossa." });
      await refresh();
    } else {
      const result = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: result.detail || "Errore." });
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse rounded-xl bg-brand-navy-light p-8 text-slate-500">
        Caricamento...
      </div>
    );
  }

  const hasByok = config?.has_api_key ?? false;
  const statusHint =
    agentStatus?.active && agentStatus.reason === "byok"
      ? "Usa la tua API Key personale (nessun credito Wamply consumato)"
      : agentStatus?.active && agentStatus.reason === "plan"
        ? "Incluso nel tuo piano di abbonamento"
        : !agentStatus?.active && !agentStatus?.plan_has_agent
          ? "Il tuo piano non include l'AI. Inserisci la tua API Key Claude per attivarlo."
          : !agentStatus?.active && agentStatus?.plan_has_agent && !agentStatus?.system_key_set
            ? "In attesa di configurazione da parte dell'amministratore."
            : "";

  return (
    <div className="space-y-6">
      {/* Status card */}
      {agentStatus && (
        <div
          className={`rounded-card border p-4 ${
            agentStatus.active
              ? "border-brand-teal/30 bg-brand-teal/10"
              : "border-slate-800 bg-brand-navy-deep"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                agentStatus.active ? "bg-brand-teal/20" : "bg-slate-800"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke={agentStatus.active ? "#0D9488" : "#94A3B8"}
                strokeWidth="2"
                className="h-5 w-5"
              >
                <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1.27A7 7 0 015.27 19H4a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z" />
                <circle cx="9" cy="14" r="1" fill={agentStatus.active ? "#0D9488" : "#94A3B8"} />
                <circle cx="15" cy="14" r="1" fill={agentStatus.active ? "#0D9488" : "#94A3B8"} />
              </svg>
            </div>
            <div className="flex-1">
              <div
                className={`text-[13px] font-semibold ${
                  agentStatus.active ? "text-brand-teal" : "text-slate-400"
                }`}
              >
                AI {agentStatus.active ? "attiva" : "non disponibile"}
              </div>
              <div className="text-[11.5px] text-slate-300">{statusHint}</div>
            </div>
            <div
              className={`h-3 w-3 rounded-full ${
                agentStatus.active ? "bg-brand-teal" : "bg-slate-500"
              }`}
            />
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-card"
      >
        {message && (
          <div
            className={`rounded-sm border p-3 text-[12px] ${
              message.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/30 bg-rose-500/10 text-rose-300"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* API Key */}
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-slate-200">
            API Key Claude personale (opzionale)
          </label>
          {hasByok ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-sm border border-brand-teal/30 bg-brand-teal/10 px-3 py-2 font-mono text-[12px] text-brand-teal">
                sk-ant-•••••••••• (configurata)
              </div>
              <button
                type="button"
                onClick={handleRemoveKey}
                disabled={saving}
                className="rounded-sm border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11.5px] font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
              >
                Rimuovi
              </button>
            </div>
          ) : (
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 font-mono text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          )}
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            {hasByok
              ? "Stai usando la tua chiave: Wamply non scala crediti AI dal piano."
              : "Opzionale. Se non la inserisci, Wamply usa la chiave condivisa del tuo piano (se incluso) e scala crediti AI."}{" "}
            La chiave viene cifrata e non è mai visibile.
          </p>
        </div>

        <div className="h-px bg-slate-800" />

        {/* Tone */}
        <div>
          <label className="mb-2 block text-[12px] font-medium text-slate-200">
            Tono dei messaggi AI
          </label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                className={`rounded-pill border px-4 py-1.5 text-[12px] font-medium transition-colors ${
                  tone === t.value
                    ? "border-brand-teal bg-brand-teal/10 text-brand-teal"
                    : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Influenza chat agent, generazione template e personalizzazione messaggi.
          </p>
        </div>

        {/* Custom instructions */}
        <div>
          <label htmlFor="ai-instructions" className="mb-1.5 block text-[12px] font-medium text-slate-200">
            Istruzioni personalizzate per l&apos;AI{" "}
            <span className="text-slate-500">(opzionale)</span>
          </label>
          <textarea
            id="ai-instructions"
            rows={4}
            maxLength={MAX_INSTRUCTIONS}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Es: Usa sempre il nome del contatto. Includi un'emoji alla fine del messaggio. Cita le promozioni in corso solo se pertinenti."
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>Verranno aggiunte al prompt di sistema dell&apos;agente AI.</span>
            <span>{instructions.length}/{MAX_INSTRUCTIONS}</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-pill bg-brand-teal py-2.5 text-[13px] font-medium text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Salva Impostazioni"}
        </button>
      </form>
    </div>
  );
}
