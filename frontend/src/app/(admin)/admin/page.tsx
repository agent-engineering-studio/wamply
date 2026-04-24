"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { UserEditModal, type AdminUser, type Plan } from "./_components/UserEditModal";
import { CampaignsTable, type AdminCampaign } from "./_components/CampaignsTable";
import { StaffTable } from "./_components/StaffTable";
import { RoleModal } from "./_components/RoleModal";
import { AICostsTab } from "./_components/AICostsTab";
import { AIRevenueTab } from "./_components/AIRevenueTab";
import { AISystemKeyTab } from "./_components/AISystemKeyTab";
import { WhatsAppApplicationsTab } from "./_components/WhatsAppApplicationsTab";
import { TAB_PERMISSIONS, type AdminTab } from "./_components/AdminSidebar";
import { can, usePermissions } from "@/lib/permissions";

interface Overview {
  total_users: number;
  mrr_cents: number;
  messages_today: number;
  active_campaigns: number;
  plan_breakdown: Record<string, number>;
}

const VALID_TABS: ReadonlySet<AdminTab> = new Set<AdminTab>([
  "overview",
  "users",
  "staff",
  "campaigns",
  "whatsapp",
  "ai_costs",
  "ai_revenue",
  "ai_key",
]);

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-brand-teal",
  professional: "bg-brand-navy",
  enterprise: "bg-brand-purple",
};

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="animate-pulse text-slate-500">Caricamento...</div>}>
      <AdminPageContent />
    </Suspense>
  );
}

function AdminPageContent() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [roleModalUser, setRoleModalUser] = useState<AdminUser | null>(null);
  const [roleModalMode, setRoleModalMode] = useState<"promote" | "edit">("promote");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const requestedTab: AdminTab = tabParam && VALID_TABS.has(tabParam as AdminTab) ? (tabParam as AdminTab) : "overview";
  const { perms, loading: permsLoading } = usePermissions();
  // Fall back to the first allowed tab if the requested one is not permitted.
  // While permissions load we optimistically use the requested tab to avoid
  // flicker; the gating below hides body content until perms are known.
  const tab: AdminTab = permsLoading
    ? requestedTab
    : can(perms, TAB_PERMISSIONS[requestedTab])
      ? requestedTab
      : ((Object.keys(TAB_PERMISSIONS) as AdminTab[]).find((t) => can(perms, TAB_PERMISSIONS[t])) ?? requestedTab);

  useEffect(() => {
    Promise.all([
      apiFetch("/admin/overview").then((r) => r.json()),
      apiFetch("/admin/users").then((r) => r.json()),
      apiFetch("/admin/campaigns").then((r) => r.json()),
      apiFetch("/admin/plans").then((r) => r.json()),
    ]).then(([o, u, c, p]) => {
      setOverview(o);
      setUsers(u.users || []);
      setCampaigns(c.campaigns || []);
      setPlans(p.plans || []);
    });
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        setCurrentUserId(data.user?.id ?? null);
      });
  }, []);

  const endUsers = useMemo(() => users.filter((u) => u.role === "user"), [users]);
  const staffUsers = useMemo(
    () => users.filter((u) => u.role === "admin" || u.role === "collaborator" || u.role === "sales"),
    [users],
  );

  if (!overview) return <div className="animate-pulse text-slate-500">Caricamento...</div>;

  const mrrFormatted = ((overview.mrr_cents ?? 0) / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  const planBreakdown = overview.plan_breakdown || {};
  const totalSubs = Object.values(planBreakdown).reduce((a, b) => a + b, 0);
  const messagesToday = (overview.messages_today ?? 0).toLocaleString("it-IT");
  const activeCampaigns = overview.active_campaigns ?? 0;

  function openPromoteModal(user?: AdminUser) {
    if (user) {
      setRoleModalUser(user);
      setRoleModalMode("promote");
      return;
    }
    router.push("/admin?tab=users");
  }

  function openEditRoleModal(user: AdminUser) {
    setRoleModalUser(user);
    setRoleModalMode("edit");
  }

  return (
    <>
      {tab === "overview" && (
        <>
          <div className="mb-5 grid grid-cols-4 gap-3.5">
            <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
              <div className="text-[26px] font-semibold text-slate-100">{overview.total_users}</div>
              <div className="text-[11px] text-slate-400">Utenti totali</div>
            </div>
            <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
              <div className="text-[26px] font-semibold text-slate-100">{mrrFormatted}</div>
              <div className="text-[11px] text-slate-400">MRR</div>
            </div>
            <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
              <div className="text-[26px] font-semibold text-slate-100">{messagesToday}</div>
              <div className="text-[11px] text-slate-400">Messaggi oggi</div>
            </div>
            <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
              <div className="text-[26px] font-semibold text-slate-100">{activeCampaigns}</div>
              <div className="text-[11px] text-slate-400">Campagne attive</div>
            </div>
          </div>

          <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
            <div className="mb-4 text-[13px] font-semibold text-slate-100">Revenue per piano</div>
            {Object.entries(planBreakdown).map(([slug, count]) => {
              const pct = totalSubs > 0 ? Math.round((count / totalSubs) * 100) : 0;
              return (
                <div key={slug} className="mb-2.5 flex items-center gap-3">
                  <span className="w-[90px] text-[12px] capitalize text-slate-400">{slug}</span>
                  <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full rounded-full ${PLAN_COLORS[slug] || "bg-gray-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-12 text-right text-[12px] font-medium text-slate-100">{count}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "users" && (
        <div className="overflow-hidden rounded-card border border-slate-800 bg-brand-navy-light shadow-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-brand-navy-deep">
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Utente</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Piano</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Stato</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Account</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Messaggi</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Registrato</th>
              </tr>
            </thead>
            <tbody>
              {endUsers.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setEditingUser(u)}
                  className="cursor-pointer border-b border-slate-800/50 last:border-0 hover:bg-brand-navy-deep"
                >
                  <td className="px-3.5 py-3">
                    <div className="text-[13px] font-medium text-slate-100">{u.full_name || u.email}</div>
                    <div className="text-[11px] text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-3.5 py-3 text-[13px] capitalize text-slate-100">{(u.subscription?.plans as Record<string, string>)?.name || "—"}</td>
                  <td className="px-3.5 py-3">
                    {(() => {
                      const s = u.subscription;
                      if (!s) return <span className="rounded-pill bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">nessuno</span>;
                      if (s.status === "trialing") {
                        const end = s.current_period_end ? new Date(s.current_period_end) : null;
                        const days = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;
                        const label = days !== null ? `trial (${days} g)` : "trial";
                        const tooltip = end ? `Scadenza: ${end.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : undefined;
                        return (
                          <span title={tooltip} className="rounded-pill bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                            {label}
                          </span>
                        );
                      }
                      return (
                        <span className={`rounded-pill px-2 py-0.5 text-[10px] font-medium ${s.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                          {s.status}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3.5 py-3">
                    {u.banned ? (
                      <span className="rounded-pill bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-300">disabilitato</span>
                    ) : !u.email_confirmed ? (
                      <span className="rounded-pill bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">da confermare</span>
                    ) : (
                      <span className="rounded-pill bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">confermato</span>
                    )}
                  </td>
                  <td className="px-3.5 py-3 text-[13px] text-slate-100">{u.messages_used}</td>
                  <td className="px-3.5 py-3 text-[11px] text-slate-400">{new Date(u.created_at).toLocaleDateString("it-IT")}</td>
                </tr>
              ))}
              {endUsers.length === 0 && (
                <tr><td colSpan={6} className="px-3.5 py-8 text-center text-[12.5px] text-slate-500">Nessun utente registrato.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "staff" && (
        <StaffTable
          users={staffUsers}
          onPromoteUser={() => openPromoteModal()}
          onChangeRole={openEditRoleModal}
        />
      )}

      {tab === "campaigns" && <CampaignsTable campaigns={campaigns} />}

      {tab === "whatsapp" && <WhatsAppApplicationsTab />}

      {tab === "ai_costs" && <AICostsTab />}
      {tab === "ai_revenue" && <AIRevenueTab />}
      {tab === "ai_key" && <AISystemKeyTab />}

      <UserEditModal
        user={editingUser}
        plans={plans}
        currentUserId={currentUserId}
        onClose={() => setEditingUser(null)}
        onSaved={(updated) =>
          setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
        }
        onDeleted={(userId) =>
          setUsers((prev) => prev.filter((u) => u.id !== userId))
        }
        onPromote={(u) => {
          setEditingUser(null);
          openPromoteModal(u);
        }}
      />

      <RoleModal
        user={roleModalUser}
        mode={roleModalMode}
        onClose={() => setRoleModalUser(null)}
        onSaved={(updated) => {
          setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        }}
      />
    </>
  );
}
