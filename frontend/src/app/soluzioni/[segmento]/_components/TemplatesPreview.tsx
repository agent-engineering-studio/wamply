import type { SegmentTemplate } from "@/content/soluzioni/_schema";

export function TemplatesPreview({ items }: { items: SegmentTemplate[] }) {
  return (
    <section id="templates" className="border-b border-white/10 py-20">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="mb-12 text-center text-[28px] font-semibold text-white">
          Template pronti da inviare
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {items.map((t) => (
            <div
              key={t.slug}
              className="flex flex-col rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
            >
              <p className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-slate-400">
                {t.title}
              </p>
              <div className="flex-1">
                <div className="relative inline-block max-w-full rounded-2xl rounded-tl-none bg-[#25D366]/15 px-4 py-3 text-[13px] leading-relaxed text-slate-200">
                  {t.preview}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
