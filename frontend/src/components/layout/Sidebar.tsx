"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "grid" },
  { href: "/campaigns", label: "Campagne", icon: "send" },
  { href: "/campaigns/new", label: "Nuovo invio", icon: "edit" },
  { href: "/contacts", label: "Contatti", icon: "users" },
  { href: "/groups", label: "Gruppi", icon: "users-plus" },
  { href: "/history", label: "Storico", icon: "clock" },
  { href: "/settings", label: "Impostazioni", icon: "settings" },
];

const ICONS: Record<string, React.ReactNode> = {
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
  "users-plus": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/><line x1="20" y1="8" x2="20" y2="14"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
};

function UsageBar({ label, used, total, color }: { label: string; used: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const display = total >= 10000 ? `${(used / 1000).toFixed(1)}k/${(total / 1000).toFixed(0)}k` : `${used}/${total}`;
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[11px] text-brand-ink-60 mb-0.5">
        <span>{label}</span>
        <span className="text-brand-ink">{display}</span>
      </div>
      <div className="h-1 rounded-full bg-brand-ink-10 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="flex h-screen w-55 flex-col border-r border-brand-ink-10 bg-white">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-brand-ink-10 px-4 py-4.5">
        <svg viewBox="0 0 400 400" className="h-8 w-8 shrink-0">
          <defs>
            <linearGradient id="sidebarLogoBg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1B2A4A" />
              <stop offset="100%" stopColor="#0F1B33" />
            </linearGradient>
          </defs>
          <rect width="400" height="400" rx="80" fill="url(#sidebarLogoBg)" />
          <path d="M90 140 L130 290 L170 190 L200 290 L230 190 L270 290 L310 140" fill="none" stroke="#fff" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M90 140 L130 290 L170 190 L200 290 L230 190 L270 290 L310 140" fill="none" stroke="#0D9488" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          <circle cx="320" cy="132" r="8" fill="#0D9488" opacity="0.9" />
          <circle cx="336" cy="120" r="5" fill="#0D9488" opacity="0.6" />
        </svg>
        <span className="text-[17px] font-semibold tracking-tight text-brand-ink">
          Wam<span className="text-brand-teal">ply</span>
        </span>
      </div>

      {/* Tenant */}
      <div className="mx-2.5 mt-2.5 mb-1 rounded-sm border border-brand-teal/20 bg-linear-to-br from-brand-teal-pale to-white px-3 py-2">
        <div className="text-[12.5px] font-medium text-brand-ink">Azienda SRL</div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-brand-teal-dark">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="#0D9488"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Piano Professional
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-px overflow-y-auto px-2 py-1.5">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] transition-colors ${
              isActive(item.href)
                ? "bg-brand-navy text-white shadow-[0_2px_8px_rgba(27,42,74,.3)]"
                : "text-brand-ink-60 hover:bg-brand-ink-05 hover:text-brand-ink"
            }`}
          >
            <span className="h-3.75 w-3.75 shrink-0">{ICONS[item.icon]}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Usage */}
      <div className="mx-2.5 mb-1.5">
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-brand-ink-30">
          Utilizzo mese
        </div>
        <UsageBar label="Campagne" used={4} total={20} color="bg-brand-teal" />
        <UsageBar label="Contatti" used={3847} total={5000} color="bg-brand-amber" />
        <UsageBar label="Messaggi AI" used={8490} total={15000} color="bg-brand-teal" />
      </div>

      {/* User */}
      <div className="border-t border-brand-ink-10 px-2.5 py-2">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-teal-light text-[11px] font-semibold text-brand-teal-dark">
            MR
          </div>
          <div>
            <div className="text-[12px] font-medium text-brand-ink">Mario Rossi</div>
            <div className="text-[10px] text-brand-ink-30">mario@azienda.it</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
