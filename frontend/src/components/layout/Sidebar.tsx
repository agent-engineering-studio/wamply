"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "grid" },
  { href: "/campaigns", label: "Campagne", icon: "send" },
  { href: "/campaigns/new", label: "Nuovo invio", icon: "edit" },
  { href: "/templates", label: "Template", icon: "template" },
  { href: "/contacts", label: "Contatti", icon: "users" },
  { href: "/groups", label: "Gruppi", icon: "users-plus" },
  { href: "/history", label: "Storico", icon: "clock" },
  { href: "/settings", label: "Impostazioni", icon: "settings" },
];

const ICONS: Record<string, React.ReactNode> = {
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  template: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
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
      <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
        <span>{label}</span>
        <span className="text-slate-100">{display}</span>
      </div>
      <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

interface CurrentUser {
  fullName: string;
  email: string;
  initials: string;
  role: string;
}

function buildInitials(fullName: string, email: string): string {
  const source = fullName.trim() || email.split("@")[0] || "";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AgentStatus {
  active: boolean;
  has_byok: boolean;
  ai_credits_limit: number;
  ai_credits_used: number;
  topup_credits: number;
  plan_slug?: string;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    apiFetch("/settings/agent-status")
      .then((r) => r.json())
      .then((data) => setAgentStatus(data))
      .catch(() => {});
  }, []);
  const agentActive = !!agentStatus?.active;
  const showCreditsNav = !!agentStatus && (
    agentStatus.has_byok ||
    agentStatus.ai_credits_limit > 0 ||
    (agentStatus.plan_slug && agentStatus.plan_slug !== "free")
  );

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      const fullName = (data.user.user_metadata?.full_name as string | undefined) ?? "";
      const email = data.user.email ?? "";
      const { data: row } = await supabase
        .from("users")
        .select("role")
        .eq("id", data.user.id)
        .single();
      if (cancelled) return;
      const role = (row?.role as string | undefined) ?? "user";
      setUser({ fullName, email, initials: buildInitials(fullName, email), role });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <aside className="flex h-screen w-55 flex-col border-r border-slate-800 bg-brand-navy-light">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-slate-800 px-4 py-4.5">
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
        <span className="text-[17px] font-semibold tracking-tight text-slate-100">
          Wam<span className="text-brand-teal">ply</span>
        </span>
      </div>

      {/* Tenant */}
      <div className="mx-2.5 mt-2.5 mb-1 rounded-sm border border-brand-teal/30 bg-brand-teal/10 px-3 py-2">
        <div className="text-[12.5px] font-medium text-slate-100">Azienda SRL</div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-brand-teal">
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
                : "text-slate-400 hover:bg-brand-navy-deep hover:text-slate-100"
            }`}
          >
            <span className="h-3.75 w-3.75 shrink-0">{ICONS[item.icon]}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Crediti AI */}
      {showCreditsNav && (
        <div className="mx-2 mb-1">
          <Link
            href="/settings/credits"
            className={`flex items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] transition-colors ${
              pathname.startsWith("/settings/credits")
                ? "bg-brand-navy text-white shadow-[0_2px_8px_rgba(27,42,74,.3)]"
                : "text-slate-400 hover:bg-brand-navy-deep hover:text-slate-100"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.75 w-3.75">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            Crediti AI
          </Link>
        </div>
      )}

      {/* Admin */}
      {user?.role === "admin" && (
        <div className="mx-2 mb-1">
          <Link
            href="/admin"
            className={`flex items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] transition-colors ${
              pathname.startsWith("/admin")
                ? "bg-brand-teal text-white shadow-teal"
                : "text-brand-teal bg-brand-teal/10 hover:bg-brand-teal/15"
            }`}
          >
            <span className="h-3.75 w-3.75 shrink-0">{ICONS.shield}</span>
            Admin
          </Link>
        </div>
      )}

      {/* Agent AI */}
      {agentActive && (
        <div className="mx-2 mb-1">
          <Link href="/agent"
            className={`flex items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] transition-colors ${
              pathname.startsWith("/agent")
                ? "bg-brand-teal text-white shadow-teal"
                : "text-brand-teal bg-brand-teal/10 hover:bg-brand-teal/15"
            }`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.75 w-3.75">
              <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1.27A7 7 0 015.27 19H4a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z" />
              <circle cx="9" cy="14" r="1" fill="currentColor" />
              <circle cx="15" cy="14" r="1" fill="currentColor" />
            </svg>
            Agent AI
          </Link>
        </div>
      )}

      {/* Usage */}
      <div className="mx-2.5 mb-1.5">
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Utilizzo mese
        </div>
        <UsageBar label="Campagne" used={4} total={20} color="bg-brand-teal" />
        <UsageBar label="Contatti" used={3847} total={5000} color="bg-brand-amber" />
        <UsageBar label="Messaggi AI" used={8490} total={15000} color="bg-brand-teal" />
      </div>

      {/* User + Logout */}
      <div className="border-t border-slate-800 px-2.5 py-2">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-teal/20 text-[11px] font-semibold text-brand-teal">
            {user?.initials ?? "··"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium text-slate-100">
              {user?.fullName || (user ? "Utente" : "\u00A0")}
            </div>
            <div className="truncate text-[10px] text-slate-500">
              {user?.email ?? "\u00A0"}
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Esci"
            className="shrink-0 rounded-sm p-1.5 text-slate-500 hover:bg-brand-navy-deep hover:text-slate-400"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
