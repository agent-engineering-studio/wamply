import Image from "next/image";
import Link from "next/link";
import type { SegmentContent } from "@/content/soluzioni/_schema";
import { SEGMENTS } from "@/lib/plans";

export function Hero({ content }: { content: SegmentContent }) {
  // Looking up the same image used in the homepage carousel keeps brand
  // continuity: card → detail page show the same visual.
  const seg = SEGMENTS.find((s) => s.slug === content.segmento);
  const image = seg?.image;

  return (
    <section className="relative overflow-hidden border-b border-white/10">
      {/* Background image (covers the whole hero, parallax-friendly) */}
      {image && (
        <div className="absolute inset-0">
          <Image
            src={image}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* Strong overlay so text stays readable on any image */}
          <div className="absolute inset-0 bg-linear-to-b from-brand-navy-deep/85 via-brand-navy-deep/75 to-brand-navy-deep" />
          <div className="absolute inset-0 bg-linear-to-r from-brand-navy-deep/70 via-transparent to-brand-navy-deep/70" />
        </div>
      )}

      {/* Decorative teal glow (kept from previous design) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-130 w-130 rounded-full bg-brand-teal/10 blur-[140px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-6 py-24 text-center md:py-32">
        <span className="mb-5 inline-flex items-center gap-2 rounded-pill border border-brand-teal/40 bg-brand-teal/15 px-4 py-1.5 text-[12px] font-medium text-brand-teal backdrop-blur-sm">
          {content.label}
        </span>
        <h1 className="text-[44px] font-semibold leading-[1.1] tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
          {content.hero.pain}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-slate-200">
          {content.hero.solution}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href={`/prova?plan=${content.recommendedPlan}&segmento=${content.segmento}`}
            className="rounded-pill bg-brand-teal px-8 py-3 text-[15px] font-medium text-white shadow-teal transition-colors hover:bg-brand-teal-dark"
          >
            {content.hero.ctaPrimary}
          </Link>
          <a
            href="#templates"
            className="rounded-pill border border-white/30 bg-brand-navy-deep/40 px-8 py-3 text-[15px] font-medium text-slate-100 backdrop-blur-sm transition-colors hover:border-white/60 hover:bg-brand-navy-deep/60"
          >
            {content.hero.ctaSecondary}
          </a>
        </div>
      </div>
    </section>
  );
}
