import type { SegmentUseCase } from "@/content/soluzioni/_schema";

export function UseCases({ items }: { items: SegmentUseCase[] }) {
  return (
    <section className="border-b border-white/10 py-20">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="mb-12 text-center text-[28px] font-semibold text-white">
          Tre casi concreti, pensati per te
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {items.map((u, i) => (
            <div
              key={i}
              className="flex flex-col rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-brand-teal">
                Caso {i + 1}
              </div>
              <h3 className="mb-3 text-[17px] font-semibold text-white">
                {u.title}
              </h3>
              <p className="mb-5 flex-1 text-[13.5px] leading-relaxed text-slate-300">
                {u.description}
              </p>
              <div className="rounded-md border border-brand-teal/30 bg-brand-teal/5 px-3 py-2 text-[12.5px] font-medium text-brand-teal">
                {u.roi}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
