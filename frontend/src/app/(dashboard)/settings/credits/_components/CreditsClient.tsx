"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { PlanSelector, type Plan } from "@/components/billing/PlanSelector";
import { CreditsBalanceCard } from "./CreditsBalanceCard";
import { TopupPackGrid } from "./TopupPackGrid";
import { UsageBreakdown } from "./UsageBreakdown";
import { PurchaseHistory } from "./PurchaseHistory";
import { CreditsFAQ } from "./CreditsFAQ";

export interface AgentStatus {
  active: boolean;
  reason: "byok" | "plan" | "inactive";
  has_byok: boolean;
  plan_has_agent: boolean;
  system_key_set: boolean;
  ai_credits_limit: number;
  ai_credits_used: number;
  ai_credits_remaining: number;
  source: "byok" | "system_key" | "none";
  topup_credits: number;
  topup_expires_at: string | null;
  plan_slug?: string;
}

export interface Pack {
  slug: "small" | "medium" | "large" | "xl";
  name: string;
  credits: number;
  amount_cents: number;
  badge: string | null;
}

export interface Purchase {
  id: string;
  pack_slug: string;
  credits_purchased: number;
  amount_cents: number;
  status: "pending" | "completed" | "failed" | "refunded";
  created_at: string;
  completed_at: string | null;
}

interface Subscription {
  status: "trialing" | "active" | "past_due" | "canceled";
  plan: { name: string; slug: string };
  current_period_end: string | null;
  cancel_at_period_end?: boolean;
  stripe_subscription_id?: string | null;
}

function CreditsContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [history, setHistory] = useState<Purchase[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topupResult = searchParams.get("topup");

  function loadSubscription() {
    return apiFetch("/settings/subscription")
      .then((r) => r.json())
      .then((d) => setSub(d.subscription ?? null));
  }

  useEffect(() => {
    Promise.all([
      apiFetch("/settings/agent-status").then((r) => r.json()),
      apiFetch("/billing/topup/packs").then((r) => r.json()),
      apiFetch("/billing/topup/history").then((r) => r.ok ? r.json() : { purchases: [] }),
      apiFetch("/settings/subscription").then((r) => r.json()),
      apiFetch("/plans").then((r) => r.json()).catch(() => ({ plans: [] })),
    ])
      .then(([st, pk, hist, subRes, plansRes]) => {
        setStatus(st);
        setPacks(pk.packs || []);
        setHistory(hist.purchases || []);
        setSub(subRes.subscription ?? null);
        setPlans((plansRes.plans || []).filter((p: Plan) => p.slug !== "free"));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleCancelToggle(cancel: boolean) {
    if (cancel && !window.confirm(
      "Confermi l'annullamento dell'abbonamento? Resterà attivo fino alla scadenza del periodo corrente, poi non sarà rinnovato.",
    )) return;
    setCancelLoading(true);
    setError(null);
    const path = cancel ? "/billing/subscription/cancel" : "/billing/subscription/resume";
    const res = await apiFetch(path, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail || "Errore durante la modifica dell'abbonamento.");
      setCancelLoading(false);
      return;
    }
    await loadSubscription();
    setCancelLoading(false);
  }

  async function handleBuy(packSlug: string) {
    setBuying(packSlug);
    setError(null);
    const res = await apiFetch("/billing/topup/checkout", {
      method: "POST",
      body: JSON.stringify({ pack_slug: packSlug }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.detail || "Errore durante l'apertura del pagamento.");
      setBuying(null);
      return;
    }
    window.location.href = body.checkout_url;
  }

  if (loading) {
    return <div className="animate-pulse rounded-card bg-brand-navy-light p-8 text-slate-500">Caricamento...</div>;
  }

  const isByok = status?.has_byok === true;
  const isFree = status?.plan_slug === "free" || !status?.plan_slug;

  return (
    <div className="space-y-6">
      {topupResult === "success" && (
        <div className="rounded-card border border-emerald-500/30 bg-emerald-500/10 p-4 text-[13px] text-emerald-300">
          Ricarica completata! I crediti verranno accreditati entro pochi secondi.
        </div>
      )}
      {topupResult === "cancelled" && (
        <div className="rounded-card border border-slate-700 bg-brand-navy-light p-4 text-[13px] text-slate-300">
          Pagamento annullato. Nessun addebito.
        </div>
      )}
      {error && (
        <div className="rounded-card border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-300">
          {error}
        </div>
      )}

      {/* Card saldo hero */}
      <CreditsBalanceCard status={status} />

      {/* Piano — info corrente + cancel/resume */}
      {sub && sub.plan.slug !== "free" && (
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11.5px] uppercase tracking-wider text-slate-500">Piano attuale</div>
              <div className="mt-1 text-[18px] font-semibold text-slate-100">{sub.plan.name}</div>
              <div className="mt-0.5 text-[12px] text-slate-400">
                {sub.status === "trialing" && "Trial attivo"}
                {sub.status === "active" && !sub.cancel_at_period_end && "Rinnovo automatico"}
                {sub.cancel_at_period_end && "Cancellazione programmata"}
                {sub.status === "past_due" && "Pagamento non riuscito"}
              </div>
            </div>
            {sub.current_period_end && (
              <div className="text-right text-[12px] text-slate-400">
                <div>{sub.cancel_at_period_end ? "Accesso fino al" : "Prossimo rinnovo"}</div>
                <div className="text-slate-200">
                  {new Date(sub.current_period_end).toLocaleDateString("it-IT", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
            )}
            {sub.stripe_subscription_id && (
              <div className="flex shrink-0 gap-2">
                {sub.cancel_at_period_end ? (
                  <button
                    type="button"
                    onClick={() => handleCancelToggle(false)}
                    disabled={cancelLoading}
                    className="rounded-pill bg-brand-teal px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
                  >
                    {cancelLoading ? "..." : "Riattiva abbonamento"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCancelToggle(true)}
                    disabled={cancelLoading}
                    className="rounded-pill border border-rose-500/40 px-3.5 py-1.5 text-[12px] font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    {cancelLoading ? "..." : "Annulla abbonamento"}
                  </button>
                )}
              </div>
            )}
          </div>

          {sub.cancel_at_period_end && sub.current_period_end && (
            <div className="mt-4 rounded-sm border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200">
              <div className="font-medium">Cancellazione programmata</div>
              <div className="mt-0.5 text-amber-200/80">
                L&apos;abbonamento resterà attivo fino al{" "}
                {new Date(sub.current_period_end).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
                {", "}poi sarà disattivato. Puoi riattivarlo entro questa data senza interruzioni.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cambia piano — upgrade/downgrade */}
      {plans.length > 0 && (
        <div>
          <div className="mb-3">
            <h2 className="text-[15px] font-semibold text-slate-100">
              {sub && sub.plan.slug !== "free" ? "Cambia piano" : "Scegli un piano"}
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-400">
              {sub && sub.plan.slug !== "free"
                ? "Passa a un piano superiore o inferiore. Il cambio è gestito da Stripe."
                : "Attiva un abbonamento per sbloccare crediti AI inclusi e ricariche."}
            </p>
          </div>
          <PlanSelector
            plans={plans}
            currentSlug={sub?.status !== "canceled" ? sub?.plan.slug : null}
            onError={setError}
          />
        </div>
      )}

      {/* Ricarica — nascosta per BYOK e Free */}
      {!isByok && !isFree && (
        <div>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-100">Ricarica ora</h2>
              <p className="mt-0.5 text-[12px] text-slate-400">
                Scegli un pacchetto. I crediti restano disponibili per 12 mesi dall&apos;acquisto.
              </p>
            </div>
          </div>
          <TopupPackGrid packs={packs} onBuy={handleBuy} loading={buying} />
        </div>
      )}

      {isByok && (
        <div className="rounded-card border border-brand-teal/30 bg-brand-teal/5 p-4 text-[13px] text-brand-teal">
          Stai usando la tua API key Claude — i top-up non sono necessari.
          Paghi direttamente Anthropic per il consumo effettivo.
        </div>
      )}

      {isFree && !isByok && (
        <div className="rounded-card border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] text-amber-300">
          Per acquistare crediti aggiuntivi devi prima scegliere un piano pagante.
          <a href="/settings/billing" className="ml-2 font-semibold underline">Vai ai piani</a>
        </div>
      )}

      {/* Breakdown consumo mensile */}
      {!isByok && !isFree && <UsageBreakdown />}

      {/* Storico acquisti */}
      {history.length > 0 && <PurchaseHistory history={history} />}

      {/* FAQ */}
      <CreditsFAQ />
    </div>
  );
}

export function CreditsClient() {
  return (
    <Suspense fallback={<div className="animate-pulse rounded-card bg-brand-navy-light p-8 text-slate-500">Caricamento...</div>}>
      <CreditsContent />
    </Suspense>
  );
}
