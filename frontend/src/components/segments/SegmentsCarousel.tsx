"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SEGMENTS } from "@/lib/plans";

/** Horizontal scrolling carousel of segment cards. CSS scroll-snap based,
 * no external library. The image is `next/image` with `fill` + `object-cover`
 * so .webp photos and .svg placeholders both fit the same 3:2 frame.
 */
export function SegmentsCarousel() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  function updateButtons() {
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateButtons();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateButtons, { passive: true });
    window.addEventListener("resize", updateButtons);
    return () => {
      el.removeEventListener("scroll", updateButtons);
      window.removeEventListener("resize", updateButtons);
    };
  }, []);

  function scrollByCards(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    // Width of one card incl. gap. We pick the first child's outer width
    // so the carousel scrolls one card at a time on any breakpoint.
    const firstCard = el.querySelector<HTMLElement>("[data-card]");
    const cardWidth = firstCard ? firstCard.offsetWidth + 16 : 320;
    el.scrollBy({ left: direction * cardWidth * 1, behavior: "smooth" });
  }

  return (
    <div className="relative">
      {/* Scroll buttons (hidden on touch devices via media query) */}
      <button
        type="button"
        aria-label="Settori precedenti"
        onClick={() => scrollByCards(-1)}
        disabled={!canPrev}
        className={`absolute left-2 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-brand-navy-deep/80 p-2 text-white backdrop-blur-sm transition-opacity md:flex ${
          canPrev ? "opacity-90 hover:bg-brand-navy-deep" : "pointer-events-none opacity-0"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Settori successivi"
        onClick={() => scrollByCards(1)}
        disabled={!canNext}
        className={`absolute right-2 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-brand-navy-deep/80 p-2 text-white backdrop-blur-sm transition-opacity md:flex ${
          canNext ? "opacity-90 hover:bg-brand-navy-deep" : "pointer-events-none opacity-0"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-12 bg-gradient-to-r from-brand-navy-deep to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-12 bg-gradient-to-l from-brand-navy-deep to-transparent" />

      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Spacer for first-item alignment under arrow */}
        <div aria-hidden="true" className="shrink-0 w-2 md:w-4" />

        {SEGMENTS.map((seg) => (
          <Link
            key={seg.slug}
            href={`/soluzioni/${seg.slug}`}
            data-card
            className="group relative shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-brand-navy-light transition-all hover:border-brand-teal/50 hover:shadow-[0_0_30px_rgba(13,148,136,0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            style={{ width: "min(78vw, 360px)" }}
          >
            {/* Image (3:2) */}
            <div className="relative aspect-[3/2] w-full overflow-hidden">
              <Image
                src={seg.image}
                alt={seg.label}
                fill
                sizes="(max-width: 768px) 78vw, 360px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-navy-deep/90 via-brand-navy-deep/20 to-transparent" />
            </div>

            {/* Text overlay */}
            <div className="absolute inset-x-0 bottom-0 p-5">
              <div className="text-[15px] font-semibold leading-tight text-white">
                {seg.label}
              </div>
              <div className="mt-1 line-clamp-2 text-[12px] text-slate-300">
                {seg.tagline}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11.5px] font-medium text-brand-teal opacity-0 transition-opacity group-hover:opacity-100">
                Scopri di più
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </div>
          </Link>
        ))}

        <div aria-hidden="true" className="shrink-0 w-2 md:w-4" />
      </div>
    </div>
  );
}
