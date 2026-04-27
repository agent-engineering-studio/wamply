"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

export interface Plan {
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

export function PlanSelector({
  plans,
  currentSlug,
  onError,
}: {
  plans: Plan[];
  currentSlug: string | null | undefined;
  onError?: (msg: string) => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleCheckout(planSlug: string) {
    setLoading(planSlug);
    const res = await apiFetch("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan_slug: planSlug }),
    });
    const body = await res.json();
    if (!res.ok) {
      onError?.(body.detail || "Errore durante il checkout.");
      setLoading(null);
      return;
    }
    window.location.href = body.checkout_url;
  }

  const sorted = [...plans].sort((a, b) => a.price_cents - b.price_cents);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {sorted.map((plan) => {
        const copy = PLAN_COPY[plan.slug];
        const isCurrent = currentSlug === plan.slug;
        const isLoading = loading === plan.slug;
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
              type="button"
              onClick={() => handleCheckout(plan.slug)}
              disabled={isLoading || isCurrent}
              className={`mt-auto w-full rounded-pill py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                copy?.highlight
                  ? "bg-brand-teal text-white shadow-teal hover:bg-brand-teal-dark"
                  : "border border-slate-700 text-slate-100 hover:bg-brand-navy-deep"
              }`}
            >
              {isCurrent ? "Piano attuale" : isLoading ? "Caricamento..." : "Scegli questo piano"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
