import Link from "next/link";
import { SEGMENTS } from "@/content/soluzioni/_segments";

export function SegmentFooter({ currentSlug }: { currentSlug: string }) {
  const others = SEGMENTS.filter((s) => s.slug !== currentSlug);

  return (
    <footer className="py-16">
      <div className="mx-auto max-w-5xl px-6">
        <p className="mb-6 text-center text-[13px] font-semibold uppercase tracking-widest text-slate-400">
          Wamply per altri settori
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {others.map((s) => (
            <Link
              key={s.slug}
              href={`/soluzioni/${s.slug}`}
              className="rounded-pill border border-white/10 px-4 py-2 text-[13px] text-slate-300 hover:border-brand-teal/40 hover:text-white transition-colors"
            >
              {s.label}
            </Link>
          ))}
        </div>
        <p className="mt-12 text-center text-[12px] text-slate-500">
          © {new Date().getFullYear()} Wamply — WhatsApp Business per le PMI italiane
        </p>
      </div>
    </footer>
  );
}
