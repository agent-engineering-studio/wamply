"use client";

import type { AgentStatus } from "./CreditsClient";

export function CreditsBalanceCard({ status }: { status: AgentStatus | null }) {
  if (!status) {
    return (
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-6 text-slate-500">
        Impossibile recuperare lo stato dei crediti.
      </div>
    );
  }

  const isByok = status.has_byok;
  const planLimit = status.ai_credits_limit;
  const planUsed = status.ai_credits_used;
  const planRemaining =
    planLimit === -1 ? -1 : Math.max(0, planLimit - planUsed);
  const topupCredits = status.topup_credits;
  const topupExpiresAt = status.topup_expires_at
    ? new Date(status.topup_expires_at)
    : null;

  // Total available (display): -1 means unlimited (enterprise w/ -1 budget)
  const totalAvailable =
    planRemaining === -1 ? "∞" : (planRemaining + topupCredits).toFixed(0);

  // Stacked progress bar: how much of the plan budget is used (amber if >=80%, rose if >=100%)
  const planPct = planLimit > 0 ? Math.min(100, (planUsed / planLimit) * 100) : 0;
  const warning = planLimit > 0 && planUsed / planLimit >= 0.8;
  const exhausted = planLimit > 0 && planUsed >= planLimit;

  // ── BYOK layout ────────────────────────────────────────────
  if (isByok) {
    return (
      <div className="rounded-card border border-brand-teal/30 bg-brand-teal/5 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-teal/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" className="h-6 w-6">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-[11.5px] uppercase tracking-wider text-brand-teal font-semibold">
              API Key personale attiva
            </div>
            <div className="mt-1 text-[20px] font-semibold text-slate-100">
              Nessun limite crediti
            </div>
            <div className="mt-1.5 text-[12.5px] text-slate-300">
              Stai usando la tua chiave Claude. I costi AI sono addebitati direttamente sul tuo
              account Anthropic — Wamply non conta crediti.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── No plan / Free ────────────────────────────────────────
  if (planLimit === 0 && topupCredits === 0) {
    return (
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-6">
        <div className="text-[11.5px] uppercase tracking-wider text-slate-500">
          Crediti disponibili
        </div>
        <div className="mt-2 text-[32px] font-bold text-slate-100">0</div>
        <div className="mt-1 text-[13px] text-slate-400">
          Il tuo piano non include crediti AI. Scegli un piano pagante o configura la tua API key
          Claude per usare le funzionalità AI.
        </div>
      </div>
    );
  }

  // ── Standard paying plan ──────────────────────────────────
  return (
    <div className="rounded-card border border-slate-800 bg-brand-navy-light p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11.5px] uppercase tracking-wider text-slate-500">
            Crediti disponibili
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-[40px] font-bold leading-none ${
                exhausted
                  ? "text-rose-300"
                  : warning
                    ? "text-amber-300"
                    : "text-slate-100"
              }`}
            >
              {totalAvailable}
            </span>
            <span className="text-[13px] text-slate-400">disponibili</span>
          </div>
          <div className="mt-1.5 text-[12.5px] text-slate-400">
            {planLimit === -1 ? (
              "Piano con crediti illimitati"
            ) : (
              <>
                <span className="text-slate-200 font-medium">
                  {planRemaining.toFixed(0)}
                </span>{" "}
                dal piano
                {topupCredits > 0 && (
                  <>
                    {" "}+{" "}
                    <span className="text-slate-200 font-medium">
                      {topupCredits.toFixed(0)}
                    </span>{" "}
                    top-up
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {topupExpiresAt && topupCredits > 0 && (
          <div className="text-right text-[11.5px] text-slate-400">
            <div>Top-up scade</div>
            <div className="text-slate-200">
              {topupExpiresAt.toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </div>
          </div>
        )}
      </div>

      {/* Progress bar (plan budget only) */}
      {planLimit > 0 && (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-[11.5px] text-slate-400">
            <span>Consumo piano di questo mese</span>
            <span className="text-slate-200">
              {planUsed.toFixed(1)} / {planLimit}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all ${
                exhausted
                  ? "bg-rose-500"
                  : warning
                    ? "bg-amber-500"
                    : "bg-brand-teal"
              }`}
              style={{ width: `${planPct}%` }}
            />
          </div>
          {exhausted && topupCredits > 0 && (
            <div className="mt-2 text-[11.5px] text-brand-teal">
              Stai usando crediti top-up ({topupCredits.toFixed(0)} rimanenti).
            </div>
          )}
          {exhausted && topupCredits === 0 && (
            <div className="mt-2 text-[11.5px] text-rose-300">
              Crediti esauriti. Ricarica con un pacchetto qui sotto o passa a un piano superiore.
            </div>
          )}
          {!exhausted && warning && (
            <div className="mt-2 text-[11.5px] text-amber-300">
              Hai usato oltre l&apos;80% dei crediti del mese — valuta un top-up.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
