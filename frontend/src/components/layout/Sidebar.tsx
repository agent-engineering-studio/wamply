"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "◉" },
  { href: "/contacts", label: "Contatti", icon: "◎" },
  { href: "/templates", label: "Template", icon: "◧" },
  { href: "/campaigns", label: "Campagne", icon: "▶" },
  { href: "/analytics", label: "Analitiche", icon: "◫" },
];

const SETTINGS_ITEMS = [
  { href: "/settings", label: "Impostazioni", icon: "⚙" },
  { href: "/settings/whatsapp", label: "WhatsApp", icon: "◈" },
  { href: "/settings/ai", label: "AI", icon: "◇" },
  { href: "/settings/agent", label: "Agente", icon: "◆" },
  { href: "/settings/billing", label: "Abbonamento", icon: "◐" },
  { href: "/settings/team", label: "Team", icon: "◑" },
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="flex h-screen w-64 flex-col bg-brand-navy-dark text-white">
      <div className="flex h-16 items-center px-6">
        <span className="text-xl font-semibold tracking-tight">Wamply</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">
          Menu
        </p>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive(item.href)
                ? "bg-brand-teal/20 text-brand-teal"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <p className="mb-2 mt-6 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">
          Configurazione
        </p>
        {SETTINGS_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive(item.href) && pathname === item.href
                ? "bg-brand-teal/20 text-brand-teal"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-white/10 px-6 py-4">
        <p className="text-xs text-slate-500">Wamply v0.3.0</p>
      </div>
    </aside>
  );
}
