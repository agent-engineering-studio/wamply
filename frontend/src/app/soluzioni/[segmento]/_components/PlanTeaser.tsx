import Link from "next/link";
import { PLANS } from "@/lib/plans";
import type { SegmentContent } from "@/content/soluzioni/_schema";

export function PlanTeaser({
  recommendedPlan,
  segmento,
}: {
  recommendedPlan: SegmentContent["recommendedPlan"];
  segmento: string;
}) {
  const plan = PLANS.find((p) => p.slug === recommendedPlan);
  if (!plan) return null;

  return (
    <section className="border-b border-white/10 py-20">
      <div className="mx-auto max-w-2xl px-6 text-center">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-brand-teal">
          Piano consigliato per te
        </p>
        <h2 className="mb-3 text-[32px] font-semibold text-white">
          {plan.displayName}
        </h2>
        <p className="mb-1 text-[15px] text-slate-300">{plan.target}</p>
        <p className="mb-8 text-[36px] font-bold text-white">
          €{plan.priceEur}
          <span className="text-[18px] font-normal text-slate-400">/mese</span>
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href={`/prova?plan=${recommendedPlan}&segmento=${segmento}`}
            className="rounded-pill bg-brand-teal px-8 py-3 text-[15px] font-medium text-white shadow-teal hover:bg-brand-teal-dark transition-colors"
          >
            Prova 14 giorni gratis
          </Link>
          <Link
            href={`/piani#${recommendedPlan}`}
            className="rounded-pill border border-slate-600 px-8 py-3 text-[15px] font-medium text-slate-300 hover:border-slate-300 hover:text-white transition-colors"
          >
            Confronta tutti i piani
          </Link>
        </div>
      </div>
    </section>
  );
}
