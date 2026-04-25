import Link from "next/link";
import type { PlanTier } from "@/lib/plans";
import { FEATURE_LABELS } from "@/lib/plans";

export function PlanCard({ plan }: { plan: PlanTier }) {
  const isHighlight = plan.highlighted;
  return (
    <div
      className={`relative flex flex-col rounded-card border p-6 shadow-card ${
        isHighlight
          ? "border-brand-teal bg-brand-navy-light ring-2 ring-brand-teal/40"
          : "border-slate-800 bg-brand-navy-light"
      }`}
    >
      {isHighlight && (
        <span className="absolute -top-3 left-6 rounded-pill bg-brand-teal px-3 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-white">
          Consigliato
        </span>
      )}
      <h3 className="text-[16px] font-semibold text-slate-100">
        {plan.displayName}
      </h3>
      <p className="mt-1 text-[12px] text-slate-400">{plan.target}</p>
      <div className="mt-4">
        <span className="text-[32px] font-bold text-slate-100">
          €{plan.priceEur}
        </span>
        <span className="text-[12px] text-slate-400">/mese</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">
        {plan.msgIncluded > 0
          ? `${plan.msgIncluded} messaggi inclusi`
          : "Solo consumo a messaggio"}
      </div>
      <ul className="mt-5 flex-1 space-y-2 text-[12px] text-slate-300">
        {(Object.keys(plan.aiFeatures) as Array<keyof PlanTier["aiFeatures"]>).map(
          (key) => {
            const enabled = plan.aiFeatures[key];
            return (
              <li
                key={key}
                className={enabled ? "text-slate-200" : "text-slate-600 line-through"}
              >
                {enabled ? "✓" : "·"} {FEATURE_LABELS[key]}
              </li>
            );
          },
        )}
        {plan.onboarding && (
          <li className="text-slate-200">✓ Onboarding 1:1 in italiano</li>
        )}
      </ul>
      <div className="mt-5 text-[10.5px] text-slate-500">
        Overage: €{plan.overageRates.marketing}/msg marketing · €
        {plan.overageRates.utility}/msg utility
      </div>
      <Link
        href={`/signup?plan=${plan.slug}`}
        className={`mt-5 block rounded-sm px-4 py-2.5 text-center text-[13px] font-medium transition-colors ${
          isHighlight
            ? "bg-brand-teal text-white hover:bg-brand-teal-dark"
            : "border border-slate-700 text-slate-100 hover:bg-brand-navy-deep"
        }`}
      >
        Prova 14 giorni
      </Link>
    </div>
  );
}
