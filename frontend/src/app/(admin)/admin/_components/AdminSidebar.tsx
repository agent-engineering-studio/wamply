"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LogoutButton } from "../../_components/LogoutButton";
import { can, usePermissions } from "@/lib/permissions";

export type AdminTab =
  | "overview"
  | "users"
  | "staff"
  | "campaigns"
  | "whatsapp"
  | "ai_costs"
  | "ai_revenue"
  | "ai_key";

export const TAB_PERMISSIONS: Record<AdminTab, string> = {
  overview: "admin.overview.view",
  users: "admin.users.view",
  staff: "admin.staff.manage",
  campaigns: "admin.campaigns.view",
  whatsapp: "admin.whatsapp.manage",
  ai_costs: "admin.ai_costs.view",
  ai_revenue: "admin.ai_revenue.view",
  ai_key: "admin.ai_key.configure",
};

interface NavItem {
  tab: AdminTab;
  label: string;
  icon: React.ReactNode;
}

const ICON_CLASS = "h-3.75 w-3.75 shrink-0";

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Generale",
    items: [
      {
        tab: "overview",
        label: "Overview",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_CLASS}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Persone",
    items: [
      {
        tab: "users",
        label: "Utenti",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_CLASS}>
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
        ),
      },
      {
        tab: "staff",
        label: "Staff",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_CLASS}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Operatività",
    items: [
      {
        tab: "campaigns",
        label: "Campagne",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_CLASS}>
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        ),
      },
      {
        tab: "whatsapp",
        label: "Pratiche WhatsApp",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_CLASS}>
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "AI",
    items: [
      {
        tab: "ai_key",
        label: "Claude API",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_CLASS}>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 118 0v4" />
          </svg>
        ),
      },
      {
        tab: "ai_costs",
        label: "AI Costs",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_CLASS}>
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
        ),
      },
      {
        tab: "ai_revenue",
        label: "AI Revenue",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_CLASS}>
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
        ),
      },
    ],
  },
];

export function AdminSidebar() {
  return (
    <Suspense fallback={<aside className="w-55 shrink-0 border-r border-slate-800 bg-brand-navy-light" />}>
      <AdminSidebarContent />
    </Suspense>
  );
}

function AdminSidebarContent() {
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get("tab") as AdminTab | null) ?? "overview";
  const { perms, loading } = usePermissions();

  const sections = loading
    ? []
    : NAV_SECTIONS
        .map((s) => ({
          ...s,
          items: s.items.filter((i) => can(perms, TAB_PERMISSIONS[i.tab])),
        }))
        .filter((s) => s.items.length > 0);

  return (
    <aside className="flex h-[calc(100vh-52px)] w-55 shrink-0 flex-col border-r border-slate-800 bg-brand-navy-light">
      {/* Header */}
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-widest text-brand-teal">
          Pannello Admin
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          Gestione piattaforma
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.title}>
            <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {section.title}
            </div>
            <div className="space-y-px">
              {section.items.map((item) => {
                const active = currentTab === item.tab;
                return (
                  <Link
                    key={item.tab}
                    href={`/admin?tab=${item.tab}`}
                    className={`flex items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] transition-colors ${
                      active
                        ? "bg-brand-navy text-white shadow-[0_2px_8px_rgba(27,42,74,.3)]"
                        : "text-slate-400 hover:bg-brand-navy-deep hover:text-slate-100"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: logout */}
      <div className="border-t border-slate-800 px-4 py-3">
        <LogoutButton />
      </div>
    </aside>
  );
}
