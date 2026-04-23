"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { AdminUser } from "./UserEditModal";

type Role = "user" | "collaborator" | "sales" | "admin";

export function RoleModal({
  user,
  mode,
  onClose,
  onSaved,
}: {
  user: AdminUser | null;
  // "promote": target starts as "user", allowed → collaborator | admin | keep user
  // "edit":    target is staff, allowed → collaborator | admin | demote to user
  mode: "promote" | "edit";
  onClose: () => void;
  onSaved: (updated: AdminUser) => void;
}) {
  const [role, setRole] = useState<Role>("collaborator");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setRole((user.role as Role) ?? "collaborator");
      setError(null);
    }
  }, [user]);

  if (!user) return null;

  async function handleSave() {
    if (!user) return;
    if (role === user.role) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    const res = await apiFetch(`/admin/users/${user.id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail || body.error || "Errore durante l'aggiornamento.");
      setSaving(false);
      return;
    }
    onSaved({ ...user, role });
    setSaving(false);
    onClose();
  }

  const title = mode === "promote" ? "Promuovi a staff" : "Modifica ruolo";
  const subtitle = mode === "promote"
    ? "Scegli il livello di accesso per questo utente."
    : "Cambia ruolo o riporta a utente normale per rimuovere dallo staff.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4">
          <div className="text-[15px] font-semibold text-slate-100">{title}</div>
          <div className="mt-1 text-[12px] text-slate-400">{subtitle}</div>
        </div>

        <div className="mb-4 rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2">
          <div className="text-[13px] font-medium text-slate-100">{user.full_name || user.email}</div>
          <div className="text-[11px] text-slate-400">{user.email}</div>
        </div>

        <div className="space-y-2">
          <RoleOption
            value="collaborator"
            selected={role === "collaborator"}
            onSelect={() => setRole("collaborator")}
            label="Collaboratore"
            desc="Accesso al pannello admin: può gestire utenti, campagne, template. Non può eliminare utenti o modificare abbonamenti."
          />
          <RoleOption
            value="sales"
            selected={role === "sales"}
            onSelect={() => setRole("sales")}
            label="Sales"
            desc="Come collaboratore, più visibilità su costi e ricavi AI. Non può gestire lo staff o configurare la Claude API."
          />
          <RoleOption
            value="admin"
            selected={role === "admin"}
            onSelect={() => setRole("admin")}
            label="Amministratore"
            desc="Accesso completo. Può eliminare utenti, modificare abbonamenti e gestire lo staff."
          />
          {mode === "edit" && (
            <RoleOption
              value="user"
              selected={role === "user"}
              onSelect={() => setRole("user")}
              label="Rimuovi dallo staff"
              desc="Riporta l'utente al ruolo standard. Perde l'accesso al pannello admin."
              danger
            />
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-sm bg-rose-500/10 p-3 text-[12px] text-rose-300">{error}</div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-pill border border-slate-700 px-4 py-1.5 text-[12px] font-medium text-slate-300 hover:bg-brand-navy-deep"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving || role === user.role}
            className="rounded-pill bg-brand-teal px-4 py-1.5 text-[12px] font-medium text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Conferma"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleOption({
  value,
  selected,
  onSelect,
  label,
  desc,
  danger,
}: {
  value: Role;
  selected: boolean;
  onSelect: () => void;
  label: string;
  desc: string;
  danger?: boolean;
}) {
  const baseBorder = danger
    ? selected ? "border-rose-500" : "border-slate-800 hover:border-rose-500/60"
    : selected ? "border-brand-teal" : "border-slate-800 hover:border-brand-teal/60";
  const baseBg = selected ? (danger ? "bg-rose-500/5" : "bg-brand-teal/5") : "bg-brand-navy-deep/40";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-sm border ${baseBorder} ${baseBg} px-3.5 py-2.5 text-left transition-colors`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? (danger ? "border-rose-500" : "border-brand-teal") : "border-slate-700"}`}>
          {selected && <span className={`h-2 w-2 rounded-full ${danger ? "bg-rose-500" : "bg-brand-teal"}`} />}
        </span>
        <div className="flex-1">
          <div className={`text-[13px] font-semibold ${danger ? "text-rose-300" : "text-slate-100"}`}>{label}</div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{desc}</div>
        </div>
      </div>
      <input type="hidden" value={value} readOnly />
    </button>
  );
}
