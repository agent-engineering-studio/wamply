import Link from "next/link";
import { loadAllSegments } from "@/content/soluzioni/_loader";

export function SegmentsGrid() {
  const segments = loadAllSegments();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {segments.map((s) => (
        <Link
          key={s.segmento}
          href={`/soluzioni/${s.segmento}`}
          aria-label={`Scopri Wamply per ${s.label}`}
          className="group relative flex flex-col rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-colors hover:border-brand-teal/40"
        >
          {s.isPlaceholder && (
            <span className="absolute right-4 top-4 rounded-pill border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-yellow-400">
              in arrivo
            </span>
          )}
          <h3 className="mb-2 text-[16px] font-semibold text-white">
            {s.label}
          </h3>
          <p className="flex-1 text-[13px] leading-relaxed text-slate-300">
            {s.hero.solution}
          </p>
          <span className="mt-4 text-[12.5px] font-medium text-brand-teal group-hover:underline">
            Scopri &rarr;
          </span>
        </Link>
      ))}
    </div>
  );
}
