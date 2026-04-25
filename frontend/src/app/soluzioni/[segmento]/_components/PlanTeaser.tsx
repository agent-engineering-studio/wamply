import Link from "next/link";
import { PLANS } from "@/lib/plans";
import type { SegmentContent } from "@/content/soluzioni/_schema";

export function PlanTeaser({ content }: { content: SegmentContent }) {
  const plan = PLANS.find((p) => p.slug === content.recommendedPlan);
  if (!plan) return null;
  return (
    <section className="border-b border-white/10 py-20">
      <div className="mx-auto max-w-3xl rounded-2xl border border-brand-teal/30 bg-brand-teal/5 p-8 text-center backdrop-blur-sm">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-brand-teal">
          Piano consigliato per il tuo settore
        </div>
        <h2 className="mb-2 text-[30px] font-semibold text-white">
          {plan.displayName} — €{plan.priceEur}/mese
        </h2>
        <p className="mb-6 text-[14px] text-slate-300">
          {plan.msgIncluded > 0
            ? `${plan.msgIncluded} messaggi inclusi. Paghi solo se superi la quota.`
            : "Canone minimo, paghi solo i messaggi che invii davvero."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/piani#${plan.slug}`}
            className="rounded-pill bg-brand-teal px-6 py-2.5 text-[14px] font-medium text-white hover:bg-brand-teal-dark transition-colors"
          >
            Vedi dettagli piano
          </Link>
          <Link
            href="/piani"
            className="rounded-pill border border-white/20 px-6 py-2.5 text-[14px] font-medium text-white/80 hover:border-white hover:text-white transition-colors"
          >
            Confronta tutti i piani
          </Link>
        </div>
      </div>
    </section>
  );
}
