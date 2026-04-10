"use client";

import { useState } from "react";
import { usePlan } from "@/hooks/usePlan";

const PLAN_ORDER = ["starter", "professional", "enterprise"] as const;

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

const PLAN_PRICES: Record<string, string> = {
  starter: "49",
  professional: "149",
  enterprise: "399",
};

interface UpgradePromptProps {
  suggestedPlan?: string;
  message?: string;
  onClose?: () => void;
}

export function UpgradePrompt({
  suggestedPlan,
  message,
  onClose,
}: UpgradePromptProps) {
  const { plan } = usePlan();
  const [open, setOpen] = useState(true);

  if (!open || !plan) return null;

  const currentIndex = PLAN_ORDER.indexOf(plan.slug as typeof PLAN_ORDER[number]);
  const upgradePlans = PLAN_ORDER.slice(currentIndex + 1);

  function handleClose() {
    setOpen(false);
    onClose?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-brand-ink">
          Potenzia il tuo piano
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {message ?? `Il piano ${plan.name} non include questa funzionalità.`}
        </p>

        <div className="mt-6 space-y-3">
          {upgradePlans.map((slug) => (
            <div
              key={slug}
              className={`flex items-center justify-between rounded-xl border p-4 ${
                slug === suggestedPlan
                  ? "border-brand-green bg-brand-green/5"
                  : "border-slate-200"
              }`}
            >
              <div>
                <p className="font-medium text-brand-ink">
                  {PLAN_LABELS[slug]}
                </p>
                <p className="text-sm text-slate-500">
                  {PLAN_PRICES[slug]} &euro;/mese
                </p>
              </div>
              <a
                href={`/settings/billing?upgrade=${slug}`}
                className="rounded-pill bg-brand-green px-5 py-2 text-sm font-medium text-white hover:bg-brand-green/90"
              >
                Upgrade
              </a>
            </div>
          ))}
        </div>

        <button
          onClick={handleClose}
          className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600"
        >
          Non ora
        </button>
      </div>
    </div>
  );
}
