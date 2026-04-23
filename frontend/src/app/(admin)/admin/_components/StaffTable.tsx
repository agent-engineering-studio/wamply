"use client";

import { useMemo, useState } from "react";
import type { AdminUser } from "./UserEditModal";
import { can, usePermissions } from "@/lib/permissions";

export function StaffTable({
  users,
  onPromoteUser,
  onChangeRole,
}: {
  users: AdminUser[];
  onPromoteUser: () => void;
  onChangeRole: (user: AdminUser) => void;
}) {
  const [query, setQuery] = useState("");
  const { perms } = usePermissions();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.full_name ?? ""} ${u.email}`.toLowerCase().includes(q),
    );
  }, [users, query]);

  const canManageStaff = can(perms, "admin.staff.manage");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca staff..."
          className="w-64 rounded-sm border border-slate-800 bg-brand-navy-light px-3 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
        />
        <button
          onClick={onPromoteUser}
          disabled={!canManageStaff}
          title={canManageStaff ? "Promuovi un utente a staff" : "Permesso insufficiente per promuovere"}
          className="ml-auto inline-flex items-center gap-1.5 rounded-pill bg-brand-teal px-3 py-1.5 text-[12px] font-medium text-white shadow-teal hover:bg-brand-teal-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Promuovi a staff
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-8 text-center text-[12.5px] text-slate-500">
          Nessun membro dello staff.
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-slate-800 bg-brand-navy-light shadow-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-brand-navy-deep">
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Membro</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Ruolo</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Account</th>
                <th className="px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Aggiunto</th>
                <th className="px-3.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/50 last:border-0 hover:bg-brand-navy-deep/60">
                  <td className="px-3.5 py-3">
                    <div className="text-[13px] font-medium text-slate-100">{u.full_name || u.email}</div>
                    <div className="text-[11px] text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-3.5 py-3">
                    {u.role === "admin" ? (
                      <span className="rounded-pill bg-brand-teal/20 px-2 py-0.5 text-[10.5px] font-semibold text-brand-teal">
                        Amministratore
                      </span>
                    ) : u.role === "sales" ? (
                      <span className="rounded-pill bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-300">
                        Sales
                      </span>
                    ) : (
                      <span className="rounded-pill bg-sky-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-sky-300">
                        Collaboratore
                      </span>
                    )}
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
                  <td className="px-3.5 py-3 text-[11px] text-slate-400">{new Date(u.created_at).toLocaleDateString("it-IT")}</td>
                  <td className="px-3.5 py-3 text-right">
                    <button
                      onClick={() => onChangeRole(u)}
                      disabled={!canManageStaff}
                      title={canManageStaff ? "Modifica ruolo o rimuovi dallo staff" : "Permesso insufficiente"}
                      className="rounded-pill border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-brand-navy-deep hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Modifica ruolo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
