"use client";

import { useLocale } from "next-intl";

import { Link, usePathname } from "@/i18n/routing";

// Small pill in the nav that toggles between IT and EN.
// Keeps the user on the same page in the other language.
export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  const other = locale === "it" ? "en" : "it";

  return (
    <Link
      href={pathname}
      locale={other}
      className="inline-flex items-center gap-1.5 rounded-pill border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-white/70 transition-colors hover:border-brand-teal/40 hover:text-white"
      aria-label={`Switch to ${other === "en" ? "English" : "Italiano"}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
      </svg>
      {other === "en" ? "EN" : "IT"}
    </Link>
  );
}
