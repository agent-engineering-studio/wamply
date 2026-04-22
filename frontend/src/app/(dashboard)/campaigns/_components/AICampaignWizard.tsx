"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

interface PlannerSuggestion {
  segment_description: string;
  estimated_audience: number;
  recommended_template_ids: string[];
  best_send_hour_local: number;
  reasoning: string;
  cautions: string[];
}

interface Template {
  id: string;
  name: string;
  category: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (campaignId: string) => void;
}

type Step = "objective" | "review" | "confirm";

const OBJECTIVE_EXAMPLES = [
  "Promo saldi estivi per clienti Milano con almeno 1 acquisto negli ultimi 6 mesi",
  "Reminder appuntamento per i clienti con tag 'settimanale'",
  "Lancio nuovo servizio ai contatti VIP con conferma richiesta",
];

export function AICampaignWizard({ open, onClose, onCreated }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("objective");
  const [objective, setObjective] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [suggestion, setSuggestion] = useState<PlannerSuggestion | null>(null);
  const [name, setName] = useState("");
  const [chosenTemplateId, setChosenTemplateId] = useState<string | null>(null);
  const [launchMode, setLaunchMode] = useState<"now" | "later">("now");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    apiFetch("/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) {
      // reset on close
      setStep("objective");
      setObjective("");
      setSuggestion(null);
      setName("");
      setChosenTemplateId(null);
      setLaunchMode("now");
      setError(null);
      setLoading(false);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function runPlanner() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/campaigns/planner", {
        method: "POST",
        body: JSON.stringify({ objective: objective.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Errore durante la pianificazione.");
      }
      setSuggestion(body as PlannerSuggestion);
      // Prefill name from first sentence of segment desc, capped to 60
      const fallback = (body.segment_description as string || "Campagna AI").split(/[.,]/)[0].slice(0, 60);
      setName(fallback);
      // Prefill template with first recommended that actually exists in user's list
      const rec = (body.recommended_template_ids as string[] || []).find((id) =>
        templates.some((t) => t.id === id),
      );
      setChosenTemplateId(rec ?? null);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
    } finally {
      setLoading(false);
    }
  }

  async function createCampaign() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          template_id: chosenTemplateId || null,
          group_id: null,
        }),
      });
      const campaign = await res.json();
      if (!res.ok || !campaign?.id) {
        throw new Error(campaign?.detail || "Errore nella creazione della campagna.");
      }
      if (launchMode === "now") {
        await apiFetch(`/campaigns/${campaign.id}/launch`, { method: "POST" });
      }
      onCreated?.(campaign.id);
      router.push(`/campaigns/${campaign.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
      setLoading(false);
    }
  }

  const recommendedTemplate = suggestion
    ? templates.find((t) => suggestion.recommended_template_ids.includes(t.id))
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-hidden rounded-card border border-indigo-500/30 bg-brand-navy-light shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-linear-to-r from-indigo-500/10 to-brand-teal/5 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[14px] font-semibold text-slate-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-indigo-300">
                <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
                <path d="M19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
              </svg>
              Crea campagna con AI
            </div>
            <div className="mt-0.5 text-[11.5px] text-slate-400">
              Descrivi l&apos;obiettivo — Wamply suggerisce segmento, template e orario.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="shrink-0 rounded-sm p-1 text-slate-400 hover:bg-brand-navy-deep hover:text-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-2.5 text-[10.5px] text-slate-500">
          <StepDot label="Obiettivo" active={step === "objective"} done={step !== "objective"} />
          <span className="h-px flex-1 bg-slate-800" />
          <StepDot label="Rivedi" active={step === "review"} done={step === "confirm"} />
          <span className="h-px flex-1 bg-slate-800" />
          <StepDot label="Conferma" active={step === "confirm"} done={false} />
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {step === "objective" && (
            <div className="space-y-3">
              <label className="block text-[11.5px] font-medium uppercase tracking-wider text-slate-400">
                Qual è il tuo obiettivo?
              </label>
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Es: Avviare promo saldi estivi per i clienti Milano che hanno acquistato almeno una volta negli ultimi 6 mesi..."
                rows={4}
                maxLength={1000}
                autoFocus
                className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
              />
              <div className="flex items-center justify-between text-[10.5px] text-slate-500">
                <span>{objective.length}/1000 · minimo 10 caratteri</span>
                <span className="rounded-pill bg-indigo-500/15 px-2 py-0.5 font-medium text-indigo-300">
                  Costa 5 crediti AI
                </span>
              </div>

              <div>
                <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-slate-500">
                  Esempi
                </div>
                <div className="space-y-1">
                  {OBJECTIVE_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setObjective(ex)}
                      className="block w-full rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2 text-left text-[12px] text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-slate-100"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "review" && suggestion && (
            <div className="space-y-4">
              {/* Segment */}
              <div className="rounded-sm border border-slate-800 bg-brand-navy-deep p-3">
                <div className="text-[10.5px] uppercase tracking-wider text-indigo-300">
                  Segmento suggerito
                </div>
                <div className="mt-1 text-[13px] text-slate-100">
                  {suggestion.segment_description}
                </div>
                <div className="mt-1 text-[11.5px] text-slate-400">
                  ~{suggestion.estimated_audience.toLocaleString("it-IT")} destinatari stimati
                </div>
              </div>

              {/* Template */}
              <div>
                <label htmlFor="wiz-template" className="mb-1 block text-[11.5px] font-medium uppercase tracking-wider text-slate-400">
                  Template
                </label>
                {templates.length === 0 ? (
                  <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
                    Non hai template. Creane uno prima di lanciare la campagna.
                  </div>
                ) : (
                  <>
                    <select
                      id="wiz-template"
                      value={chosenTemplateId ?? ""}
                      onChange={(e) => setChosenTemplateId(e.target.value || null)}
                      className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
                    >
                      <option value="">Nessun template</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.category})
                          {recommendedTemplate?.id === t.id ? " — consigliato" : ""}
                        </option>
                      ))}
                    </select>
                    {recommendedTemplate && (
                      <div className="mt-1 text-[10.5px] text-indigo-300">
                        ⚡ Consigliato: {recommendedTemplate.name}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Timing */}
              <div className="flex items-center gap-2 rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2 text-[12px] text-slate-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" className="h-4 w-4">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Orario consigliato:{" "}
                <strong className="text-slate-100">
                  {suggestion.best_send_hour_local.toString().padStart(2, "0")}:00
                </strong>
              </div>

              {/* Reasoning */}
              <details className="rounded-sm border border-slate-800 bg-brand-navy-deep">
                <summary className="cursor-pointer px-3 py-2 text-[11.5px] font-medium text-indigo-300 hover:text-indigo-200">
                  Perché questa proposta?
                </summary>
                <div className="border-t border-slate-800 px-3 py-2 text-[11.5px] leading-relaxed text-slate-400">
                  {suggestion.reasoning}
                </div>
              </details>

              {/* Cautions */}
              {suggestion.cautions.length > 0 && (
                <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-amber-300">
                    Attenzione
                  </div>
                  <ul className="space-y-0.5 text-[11.5px] text-amber-200/90">
                    {suggestion.cautions.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-0.5 text-amber-400">·</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              <div>
                <label htmlFor="wiz-name" className="mb-1 block text-[11.5px] font-medium uppercase tracking-wider text-slate-400">
                  Nome campagna
                </label>
                <input
                  id="wiz-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  autoFocus
                  className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <div className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wider text-slate-400">
                  Quando inviare
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLaunchMode("now")}
                    className={`rounded-sm border p-3 text-left transition-colors ${
                      launchMode === "now"
                        ? "border-brand-teal bg-brand-teal/10"
                        : "border-slate-800 bg-brand-navy-deep hover:border-slate-700"
                    }`}
                  >
                    <div className="text-[12.5px] font-medium text-slate-100">Subito</div>
                    <div className="mt-0.5 text-[10.5px] text-slate-400">
                      Parte non appena confermi
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLaunchMode("later")}
                    className={`rounded-sm border p-3 text-left transition-colors ${
                      launchMode === "later"
                        ? "border-brand-teal bg-brand-teal/10"
                        : "border-slate-800 bg-brand-navy-deep hover:border-slate-700"
                    }`}
                  >
                    <div className="text-[12.5px] font-medium text-slate-100">Salva bozza</div>
                    <div className="mt-0.5 text-[10.5px] text-slate-400">
                      Lancia più tardi
                    </div>
                  </button>
                </div>
              </div>

              <div className="rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2.5 text-[11.5px] text-slate-400">
                <div className="mb-1 font-medium text-slate-200">Riepilogo</div>
                <div>Nome: <span className="text-slate-100">{name || "—"}</span></div>
                <div>
                  Template:{" "}
                  <span className="text-slate-100">
                    {templates.find((t) => t.id === chosenTemplateId)?.name ?? "nessuno"}
                  </span>
                </div>
                <div>
                  Azione:{" "}
                  <span className="text-slate-100">
                    {launchMode === "now" ? "creazione + lancio immediato" : "creazione in bozza"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-800 bg-brand-navy-deep/50 px-5 py-3">
          <button
            type="button"
            onClick={() => {
              if (step === "review") setStep("objective");
              else if (step === "confirm") setStep("review");
              else onClose();
            }}
            disabled={loading}
            className="rounded-pill px-3 py-1.5 text-[12px] text-slate-400 hover:text-slate-200 disabled:opacity-40"
          >
            {step === "objective" ? "Annulla" : "← Indietro"}
          </button>
          <div className="flex items-center gap-2">
            {step === "objective" && (
              <button
                type="button"
                onClick={runPlanner}
                disabled={loading || objective.trim().length < 10}
                className="rounded-pill bg-indigo-500 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
              >
                {loading ? "Analisi in corso..." : "Pianifica →"}
              </button>
            )}
            {step === "review" && (
              <button
                type="button"
                onClick={() => setStep("confirm")}
                disabled={!chosenTemplateId}
                className="rounded-pill bg-brand-teal px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-teal-dark disabled:opacity-40"
              >
                Continua →
              </button>
            )}
            {step === "confirm" && (
              <button
                type="button"
                onClick={createCampaign}
                disabled={loading || !name.trim()}
                className="rounded-pill bg-brand-teal px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-teal-dark disabled:opacity-40"
              >
                {loading
                  ? "Creazione..."
                  : launchMode === "now"
                    ? "Crea e invia"
                    : "Crea bozza"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepDot({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 font-medium transition-colors ${
        active
          ? "bg-indigo-500/20 text-indigo-300"
          : done
            ? "bg-brand-teal/15 text-brand-teal"
            : "bg-brand-navy-deep text-slate-500"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "bg-indigo-400" : done ? "bg-brand-teal" : "bg-slate-600"
        }`}
      />
      {label}
    </span>
  );
}
