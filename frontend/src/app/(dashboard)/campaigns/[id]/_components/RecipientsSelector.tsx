"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

interface Group {
  id: string;
  name: string;
  member_count: number;
  opt_in_count: number;
}

interface Props {
  campaignId: string;
  campaignStatus: string;
  currentGroupId: string | null;
  onSaved: (groupId: string | null) => void;
}

export function RecipientsSelector({ campaignId, campaignStatus, currentGroupId, onSaved }: Props) {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [allCount, setAllCount] = useState<number | null>(null);
  const [unsentCount, setUnsentCount] = useState<number | null>(null);
  const [selected, setSelected] = useState<string>(currentGroupId ?? "__all__");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sendingNew, setSendingNew] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const isDraft = campaignStatus === "draft";
  const isRunning = campaignStatus === "running";
  const hasBeenLaunched = !isDraft;
  const dirty = selected !== (currentGroupId ?? "__all__");

  useEffect(() => {
    apiFetch("/groups").then((r) => r.json()).then((d) => setGroups(d.groups || []));
    apiFetch("/contacts/count").then((r) => r.json()).then((d) => setAllCount(d.count ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasBeenLaunched) return;
    apiFetch(`/campaigns/${campaignId}/unsent-count`)
      .then((r) => r.json())
      .then((d) => setUnsentCount(d.unsent_count ?? 0))
      .catch(() => {});
  }, [campaignId, hasBeenLaunched]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const r = await apiFetch(`/campaigns/${campaignId}`, {
        method: "PUT",
        body: JSON.stringify({ group_id: selected === "__all__" ? null : selected }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
      onSaved(selected === "__all__" ? null : selected);
      setSaved(true);
      if (hasBeenLaunched) {
        const c = await apiFetch(`/campaigns/${campaignId}/unsent-count`).then((r) => r.json()).catch(() => ({}));
        setUnsentCount(c.unsent_count ?? 0);
      }
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Errore nel salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendToNew() {
    setSendError(null);
    setSendingNew(true);
    try {
      const r = await apiFetch(`/campaigns/${campaignId}/send-to-new`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
      const data = await r.json();
      router.push(`/campaigns/${data.id}`);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Errore durante la creazione.");
      setSendingNew(false);
    }
  }

  const selectedGroup = groups.find((g) => g.id === selected);
  const estimatedCount = selected === "__all__" ? allCount : (selectedGroup?.member_count ?? null);

  return (
    <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-slate-100">Destinatari</h3>
          <p className="mt-0.5 text-[11.5px] text-slate-400">
            {isDraft
              ? "Scegli a chi inviare. Verranno inclusi solo i contatti con opt-in attivo."
              : "Cambia gruppo per includere nuovi contatti, poi invia a chi non ha ancora ricevuto il messaggio."}
          </p>
        </div>

        {/* Unsent action — only when not currently running */}
        {hasBeenLaunched && !isRunning && unsentCount !== null && unsentCount > 0 && (
          <button
            type="button"
            onClick={handleSendToNew}
            disabled={sendingNew}
            className="shrink-0 flex items-center gap-1.5 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[12px] font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" />
            </svg>
            {sendingNew ? "Creazione campagna…" : `Invia ai ${unsentCount} non raggiunti`}
          </button>
        )}

        {hasBeenLaunched && isRunning && (
          <span className="shrink-0 flex items-center gap-1.5 text-[12px] text-amber-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Invio in corso…
          </span>
        )}

        {campaignStatus === "completed" && !isRunning && unsentCount === 0 && (
          <span className="shrink-0 text-[12px] text-emerald-400">✓ Tutti i contatti raggiunti</span>
        )}

        {campaignStatus === "failed" && (
          <span className="shrink-0 flex items-center gap-1.5 text-[12px] text-rose-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
            Invio fallito
          </span>
        )}
      </div>

      {sendError && (
        <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {sendError}
        </div>
      )}

      <div className="space-y-2">
        <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3.5 transition-colors ${
          selected === "__all__" ? "border-brand-teal/50 bg-brand-teal/5" : "border-slate-700 hover:border-slate-600"
        }`}>
          <input type="radio" name={`audience-${campaignId}`} value="__all__"
            checked={selected === "__all__"} onChange={() => setSelected("__all__")}
            className="mt-0.5 accent-brand-teal" />
          <div>
            <div className="text-[13px] font-medium text-slate-100">Tutti i contatti</div>
            <div className="text-[11px] text-slate-400">
              {allCount !== null ? `${allCount} contatti con opt-in` : "Caricamento…"}
            </div>
          </div>
        </label>

        {groups.length === 0 ? (
          <p className="rounded-md border border-slate-800 p-3.5 text-[12px] text-slate-500">
            Nessun gruppo.{" "}
            <a href="/groups" className="text-brand-teal hover:underline">Crea un gruppo</a>{" "}
            per targetizzare un segmento specifico.
          </p>
        ) : (
          groups.map((g) => {
            const noOptIn = g.opt_in_count === 0;
            return (
              <label key={g.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3.5 transition-colors ${
                selected === g.id ? "border-brand-teal/50 bg-brand-teal/5" : "border-slate-700 hover:border-slate-600"
              }`}>
                <input type="radio" name={`audience-${campaignId}`} value={g.id}
                  checked={selected === g.id} onChange={() => setSelected(g.id)}
                  className="mt-0.5 accent-brand-teal" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-slate-100">{g.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {g.member_count} membri ·{" "}
                    <span className={noOptIn ? "text-rose-400" : "text-emerald-400"}>
                      {g.opt_in_count} con opt-in
                    </span>
                  </div>
                  {noOptIn && (
                    <div className="mt-1 text-[10.5px] text-rose-400/90">
                      Nessun contatto con opt-in: la campagna non può partire con questo gruppo.
                    </div>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>

      {isDraft && estimatedCount !== null && (
        <div className="mt-4 rounded-sm bg-slate-800/50 px-4 py-2.5 text-[12px] text-slate-300">
          <strong className="text-slate-100">{estimatedCount}</strong> messaggi verranno inviati all&apos;avvio
        </div>
      )}

      {saveError && (
        <div className="mt-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {saveError}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={handleSave} disabled={saving || !dirty}
          className="rounded-sm bg-brand-teal px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-40">
          {saving ? "Salvataggio…" : "Salva destinatari"}
        </button>
        {saved && <span className="text-[12px] text-emerald-400">✓ Salvato</span>}
        {!dirty && !saved && (
          <span className="text-[11.5px] text-slate-500">
            {currentGroupId
              ? `Gruppo: ${groups.find((g) => g.id === currentGroupId)?.name ?? "…"}`
              : "Tutti i contatti opt-in"}
          </span>
        )}
      </div>
    </div>
  );
}
