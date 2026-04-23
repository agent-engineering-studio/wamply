"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  subscription: { status: string; current_period_end?: string | null; plans: { name: string; slug: string } } | null;
  messages_used: number;
  banned: boolean;
  email_confirmed: boolean;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
}

function buildInitials(fullName: string, email: string): string {
  const source = fullName.trim() || email.split("@")[0] || "";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserEditModal({
  user,
  plans,
  currentUserId,
  viewerRole,
  onClose,
  onSaved,
  onDeleted,
  onPromote,
}: {
  user: AdminUser | null;
  plans: Plan[];
  currentUserId: string | null;
  viewerRole: "admin" | "collaborator" | "sales" | null;
  onClose: () => void;
  onSaved: (updated: AdminUser) => void;
  onDeleted?: (userId: string) => void;
  onPromote?: (user: AdminUser) => void;
}) {
  const [planSlug, setPlanSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (user) {
      setPlanSlug(user.subscription?.plans.slug ?? "starter");
      setError(null);
      setConfirmOpen(false);
      setConfirmEmail("");
      setResetOpen(false);
      setNewPassword("");
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [user, onClose]);

  if (!user) return null;

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/users/${user.id}/plan`, {
        method: "PUT",
        body: JSON.stringify({ plan_slug: planSlug }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Errore ${res.status}`);
      }
      const data = await res.json();
      onSaved({ ...user, subscription: data.subscription });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
      setSaving(false);
    }
  }

  async function handleToggleBan() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ banned: !user.banned }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Errore ${res.status}`);
      }
      const data = await res.json();
      onSaved({ ...user, banned: data.banned });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!user) return;
    setResetting(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/users/${user.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Errore ${res.status}`);
      }
      setResetOpen(false);
      setNewPassword("");
      setError(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
    } finally {
      setResetting(false);
    }
  }

  async function handleDelete() {
    if (!user) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Errore ${res.status}`);
      }
      onDeleted?.(user.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
      setDeleting(false);
    }
  }

  const initials = buildInitials(user.full_name ?? "", user.email);
  const canConfirmDelete = confirmEmail.trim().toLowerCase() === user.email.toLowerCase();
  const isSelf = !!currentUserId && user.id === currentUserId;
  const isAdminViewer = viewerRole === "admin";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-edit-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-card"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-teal/20 text-[13px] font-semibold text-brand-teal">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="user-edit-title"
              className="truncate text-[14px] font-semibold text-slate-100"
            >
              {user.full_name || "Utente"}
            </h2>
            <div className="truncate text-[11px] text-slate-500">{user.email}</div>
          </div>
          <span className="shrink-0 rounded-pill bg-brand-navy-deep px-2 py-0.5 text-[10.5px] uppercase tracking-wider text-slate-400">
            {user.role}
          </span>
        </div>

        {error && (
          <div className="mb-3 rounded-sm border border-red-900/40 bg-red-950/30 p-2 text-[12px] text-red-300">
            {error}
          </div>
        )}

        <dl className="mb-4 space-y-1.5 text-[12px]">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Piano attuale</dt>
            <dd className="text-slate-200">
              {user.subscription?.plans.name ?? "Nessuno"}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Messaggi usati (mese)</dt>
            <dd className="text-slate-200">{user.messages_used}</dd>
          </div>
        </dl>

        <div className="mb-5">
          <label className="mb-1 block text-[11.5px] font-medium text-slate-400">
            Cambia piano
          </label>
          <select
            value={planSlug}
            onChange={(e) => setPlanSlug(e.target.value)}
            className="w-full rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none"
          >
            {plans.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} — {(p.price_cents / 100).toFixed(2)} €/mese
              </option>
            ))}
          </select>
        </div>

        {resetOpen && (
          <div className="mb-4 rounded-sm border border-amber-900/60 bg-amber-950/30 p-3">
            <p className="mb-2 text-[12px] text-amber-200">
              Imposta una nuova password per <strong>{user.email}</strong>. Tutte le
              sessioni attive verranno disconnesse.
            </p>
            <label className="mb-1 block text-[11px] text-amber-200">Nuova password (min. 10 caratteri)</label>
            <input
              type="password"
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Almeno 10 caratteri"
              className="w-full rounded-sm border border-amber-900/60 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 focus:border-amber-500 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setResetOpen(false);
                  setNewPassword("");
                }}
                className="rounded-sm px-3 py-1.5 text-[12px] font-medium text-slate-400 hover:bg-brand-navy-deep"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resetting || newPassword.length < 10}
                className="rounded-sm bg-amber-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {resetting ? "Salvataggio..." : "Imposta password"}
              </button>
            </div>
          </div>
        )}

        {confirmOpen && (
          <div className="mb-4 rounded-sm border border-red-900/60 bg-red-950/40 p-3">
            <p className="mb-2 text-[12px] text-red-200">
              Questa azione è <strong>irreversibile</strong>. Verranno rimossi account,
              contatti, template, campagne e tutti i dati dell&apos;utente.
            </p>
            <label className="mb-1 block text-[11px] text-red-300">
              Digita <code className="rounded-sm bg-red-950/60 px-1 text-red-200">{user.email}</code> per confermare
            </label>
            <input
              type="email"
              autoFocus
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="w-full rounded-sm border border-red-900/60 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 focus:border-red-500 focus:outline-none"
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {!confirmOpen ? (
            isSelf ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  className="rounded-sm border border-slate-700 px-3 py-2 text-[12.5px] font-medium text-slate-300 hover:bg-brand-navy-deep"
                >
                  Resetta password
                </button>
                <span className="text-[11px] italic text-slate-500">
                  Non puoi disabilitare o eliminare te stesso.
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  className="rounded-sm border border-slate-700 px-3 py-2 text-[12.5px] font-medium text-slate-300 hover:bg-brand-navy-deep"
                >
                  Resetta password
                </button>
                {isAdminViewer && user.role === "user" && onPromote && (
                  <button
                    type="button"
                    onClick={() => onPromote(user)}
                    className="rounded-sm border border-brand-teal/50 px-3 py-2 text-[12.5px] font-medium text-brand-teal hover:bg-brand-teal/10"
                  >
                    Promuovi a staff
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleToggleBan}
                  disabled={saving || !isAdminViewer}
                  title={
                    !isAdminViewer
                      ? "Solo gli amministratori possono disabilitare"
                      : user.banned
                        ? "Riattiva l'account"
                        : "Disabilita l'account (reversibile)"
                  }
                  className={`rounded-sm border px-3 py-2 text-[12.5px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                    user.banned
                      ? "border-amber-600/60 text-amber-400 hover:bg-amber-950/40"
                      : "border-slate-700 text-slate-300 hover:bg-brand-navy-deep"
                  }`}
                >
                  {user.banned ? "Riattiva" : "Disabilita"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!onDeleted || !isAdminViewer}
                  title={!isAdminViewer ? "Solo gli amministratori possono eliminare" : undefined}
                  className="rounded-sm border border-red-900/60 px-3 py-2 text-[12.5px] font-medium text-red-400 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Elimina utente
                </button>
              </div>
            )
          ) : (
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmEmail("");
              }}
              className="rounded-sm px-3 py-2 text-[12.5px] font-medium text-slate-400 hover:bg-brand-navy-deep"
            >
              Annulla eliminazione
            </button>
          )}
          <div className="flex items-center gap-3">
          {confirmOpen ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canConfirmDelete || deleting}
              className="rounded-sm bg-red-600 px-5 py-2 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Eliminazione..." : "Elimina definitivamente"}
            </button>
          ) : (
            <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm px-4 py-2 text-[13px] font-medium text-slate-400 hover:bg-brand-navy-deep"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isAdminViewer}
            title={!isAdminViewer ? "Solo gli amministratori possono modificare l'abbonamento" : undefined}
            className="rounded-sm bg-brand-teal px-5 py-2 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(13,148,136,.3)] hover:bg-brand-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </button>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
