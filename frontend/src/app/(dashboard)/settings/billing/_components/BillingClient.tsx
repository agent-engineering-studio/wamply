"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

interface Subscription {
  status: "trialing" | "active" | "past_due" | "canceled";
  plan: { name: string; slug: string };
  current_period_start: string | null;
  current_period_end: string | null;
  trial_days_remaining: number | null;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  max_campaigns_month: number;
  max_contacts: number;
  max_messages_month: number;
  max_templates: number;
  max_team_members: number;
}

const PLAN_COPY: Record<string, { tagline: string; features: string[]; highlight?: boolean }> = {
  starter: {
    tagline: "Perfetto per iniziare",
    features: [
      "5 campagne/mese",
      "500 contatti",
      "2.500 messaggi WhatsApp",
      "AI con la tua API key (BYOK)",
    ],
  },
  professional: {
    tagline: "Il più scelto",
    features: [
      "20 campagne/mese",
      "5.000 contatti",
      "15.000 messaggi WhatsApp",
      "200 crediti AI/mese inclusi",
      "A/B testing + Analytics",
      "API access",
    ],
    highlight: true,
  },
  enterprise: {
    tagline: "Per chi scala",
    features: [
      "Campagne illimitate",
      "50.000 contatti",
      "100.000 messaggi WhatsApp",
      "1.500 crediti AI + BYOK illimitato",
      "Team fino a 10",
      "White label",
    ],
  },
};

function BillingContent() {
  const searchParams = useSearchParams();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkoutResult = searchParams.get("checkout");

  useEffect(() => {
    Promise.all([
      apiFetch("/settings/subscription").then((r) => r.json()),
      apiFetch("/plans").then((r) => r.json()).catch(() => ({ plans: [] })),
    ])
      .then(([subRes, plansRes]) => {
        setSub(subRes.subscription ?? null);
        setPlans((plansRes.plans || []).filter((p: Plan) => p.slug !== "free"));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleCheckout(planSlug: string) {
    setCheckoutLoading(planSlug);
    setError(null);
    const res = await apiFetch("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan_slug: planSlug }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.detail || "Errore durante il checkout.");
      setCheckoutLoading(null);
      return;
    }
    window.location.href = body.checkout_url;
  }

  if (loading) {
    return <div className="animate-pulse rounded-card bg-brand-navy-light p-8 text-slate-500">Caricamento...</div>;
  }

  const isFree = sub?.plan.slug === "free";
  const isTrialing = sub?.status === "trialing";
  const isPastDue = sub?.status === "past_due";

  return (
    <div className="space-y-6">
      {checkoutResult === "success" && (
        <div className="rounded-card border border-emerald-500/30 bg-emerald-500/10 p-4 text-[13px] text-emerald-300">
          Pagamento completato. Il tuo piano verrà attivato entro pochi secondi.
        </div>
      )}
      {checkoutResult === "cancelled" && (
        <div className="rounded-card border border-slate-700 bg-brand-navy-light p-4 text-[13px] text-slate-300">
          Checkout annullato. Nessuna spesa è stata effettuata.
        </div>
      )}
      {error && (
        <div className="rounded-card border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-300">
          {error}
        </div>
      )}

      {sub && (
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11.5px] uppercase tracking-wider text-slate-500">Piano attuale</div>
              <div className="mt-1 text-[20px] font-semibold text-slate-100">{sub.plan.name}</div>
              <div className="mt-1 text-[12.5px] text-slate-400">
                {isTrialing && sub.trial_days_remaining !== null && (
                  <>Trial — {sub.trial_days_remaining === 0 ? "scade oggi" : `${sub.trial_days_remaining} giorni rimanenti`}</>
                )}
                {isFree && "Trial terminato. Scegli un piano per riattivare l'accesso."}
                {isPastDue && "Pagamento non riuscito. Aggiorna il metodo di pagamento per continuare."}
                {!isTrialing && !isFree && !isPastDue && sub.status === "active" && "Attivo"}
              </div>
            </div>
            {sub.current_period_end && !isFree && (
              <div className="text-right text-[12px] text-slate-400">
                <div>Prossimo rinnovo</div>
                <div className="text-slate-200">
                  {new Date(sub.current_period_end).toLocaleDateString("it-IT", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans
          .sort((a, b) => a.price_cents - b.price_cents)
          .map((plan) => {
            const copy = PLAN_COPY[plan.slug];
            const isCurrent = sub?.plan.slug === plan.slug && sub?.status !== "canceled";
            const loading = checkoutLoading === plan.slug;
            return (
              <div
                key={plan.id}
                className={`flex flex-col rounded-card border p-5 ${
                  copy?.highlight
                    ? "border-brand-teal/60 bg-brand-teal/5 shadow-teal"
                    : "border-slate-800 bg-brand-navy-light"
                }`}
              >
                {copy?.highlight && (
                  <div className="mb-2 inline-block w-fit rounded-pill bg-brand-teal/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-teal">
                    Consigliato
                  </div>
                )}
                <div className="text-[15px] font-semibold text-slate-100">{plan.name}</div>
                {copy?.tagline && (
                  <div className="mt-0.5 text-[12px] text-slate-400">{copy.tagline}</div>
                )}
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-[26px] font-bold text-slate-100">
                    €{(plan.price_cents / 100).toFixed(0)}
                  </span>
                  <span className="text-[12px] text-slate-400">/mese</span>
                </div>
                <ul className="mt-4 mb-5 space-y-1.5 text-[12.5px] text-slate-300">
                  {(copy?.features ?? []).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.5" className="mt-0.5 h-3.5 w-3.5 shrink-0">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleCheckout(plan.slug)}
                  disabled={loading || isCurrent}
                  className={`mt-auto w-full rounded-pill py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                    copy?.highlight
                      ? "bg-brand-teal text-white shadow-teal hover:bg-brand-teal-dark"
                      : "border border-slate-700 text-slate-100 hover:bg-brand-navy-deep"
                  }`}
                >
                  {isCurrent ? "Piano attuale" : loading ? "Caricamento..." : "Scegli questo piano"}
                </button>
              </div>
            );
          })}
      </div>

      <div className="flex items-center gap-3 rounded-card border border-slate-800 bg-brand-navy-deep p-4 text-[12px] text-slate-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" className="h-4 w-4 shrink-0">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        <span>
          Pagamenti gestiti in sicurezza da <strong className="text-slate-200">Stripe</strong>. Accettiamo carte di credito e SEPA Direct Debit. I dati della carta non transitano mai dai nostri server.
        </span>
      </div>
    </div>
  );
}

export function BillingClient() {
  return (
    <Suspense fallback={<div className="animate-pulse rounded-card bg-brand-navy-light p-8 text-slate-500">Caricamento...</div>}>
      <BillingContent />
    </Suspense>
  );
}
