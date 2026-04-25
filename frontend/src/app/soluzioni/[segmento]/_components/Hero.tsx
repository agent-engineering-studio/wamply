import Link from "next/link";
import type { SegmentContent } from "@/content/soluzioni/_schema";

export function Hero({ content }: { content: SegmentContent }) {
  return (
    <section className="relative overflow-hidden border-b border-white/10 px-6 py-20">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[520px] w-[520px] rounded-full bg-brand-teal/10 blur-[140px]" />
      </div>
      <div className="relative mx-auto max-w-4xl text-center">
        <span className="mb-5 inline-flex items-center gap-2 rounded-pill border border-brand-teal/30 bg-brand-teal/10 px-4 py-1.5 text-[12px] font-medium text-brand-teal">
          {content.label}
        </span>
        <h1 className="text-[44px] font-semibold leading-[1.1] tracking-tight text-white">
          {content.hero.pain}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-slate-300">
          {content.hero.solution}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href={`/prova?plan=${content.recommendedPlan}&segmento=${content.segmento}`}
            className="rounded-pill bg-brand-teal px-8 py-3 text-[15px] font-medium text-white shadow-teal hover:bg-brand-teal-dark transition-colors"
          >
            {content.hero.ctaPrimary}
          </Link>
          <a
            href="#templates"
            className="rounded-pill border border-slate-600 px-8 py-3 text-[15px] font-medium text-slate-300 hover:border-slate-300 hover:text-white transition-colors"
          >
            {content.hero.ctaSecondary}
          </a>
        </div>
      </div>
    </section>
  );
}
