"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface SubaccountRow {
  subaccount_sid: string;
  user_id: string;
  email: string;
  full_name: string | null;
  messages_month: number;
  est_cost_eur: number;
  status: string | null;
}

interface Policy {
  auto_create_subaccount_on_signup: boolean;
  default_region: string;
  number_pool: string[];
}

interface OverviewResponse {
  master: {
    account_sid: string;
    auth_token_masked: string;
    auth_token_source: "db" | "env" | "none";
    messaging_service_sid: string;
  };
  policy: Policy;
  subaccounts: SubaccountRow[];
  connection_ok: boolean;
}

interface AuditRow {
  id: string;
  action: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function AdminTwilioTab() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [rotateDraft, setRotateDraft] = useState("");
  const [rotateSaving, setRotateSaving] = useState(false);
  const [policyDraft, setPolicyDraft] = useState<Policy | null>(null);
  const [policySaving, setPolicySaving] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [filter, setFilter] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const [ov, au] = await Promise.all([
        apiFetch("/admin/twilio/overview").then((r) => r.json()),
        apiFetch("/admin/audit?prefix=twilio_").then((r) => (r.ok ? r.json() : { items: [] })),
      ]);
      setData(ov);
      setPolicyDraft(ov.policy);
      setAudit(au.items || []);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Errore caricamento" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function handleRotate() {
    if (rotateDraft.trim().length < 20) {
      setMsg({ type: "err", text: "Auth token troppo corto (minimo 20 caratteri)." });
      return;
    }
    if (!confirm("Ruotare il master auth token? Le chiamate in corso verso Twilio potrebbero fallire brevemente.")) return;
    setRotateSaving(true);
    try {
      const r = await apiFetch("/admin/twilio/rotate-master", {
        method: "POST",
        body: JSON.stringify({ auth_token: rotateDraft.trim() }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRotateDraft("");
      setMsg({ type: "ok", text: "Token master ruotato e cifrato in DB." });
      await reload();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setRotateSaving(false);
    }
  }

  async function handlePolicySave() {
    if (!policyDraft) return;
    setPolicySaving(true);
    try {
      const r = await apiFetch("/admin/twilio/policy", {
        method: "PATCH",
        body: JSON.stringify(policyDraft),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMsg({ type: "ok", text: "Policy aggiornata." });
      await reload();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setPolicySaving(false);
    }
  }

  async function handleSuspend(sid: string) {
    if (!confirm(`Sospendere il subaccount ${sid}? Le campagne attive si fermeranno.`)) return;
    try {
      const r = await apiFetch(`/admin/twilio/subaccount/${sid}/suspend`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMsg({ type: "ok", text: `Subaccount ${sid} sospeso.` });
      await reload();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Errore" });
    }
  }

  if (loading) return <div className="animate-pulse text-[12.5px] text-slate-500">Caricamento…</div>;
  if (!data || !policyDraft) return <div className="text-[12.5px] text-rose-300">Errore caricamento dati Twilio.</div>;

  const visibleSubs = data.subaccounts.filter((s) =>
    !filter || s.email.toLowerCase().includes(filter.toLowerCase()) || s.subaccount_sid.includes(filter)
  );

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`rounded-sm border px-3 py-2 text-[12px] ${
          msg.type === "ok"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-rose-500/30 bg-rose-500/10 text-rose-300"
        }`}>{msg.text}</div>
      )}

      {/* Sezione 1: Master config */}
      <section className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-slate-100">Configurazione master Twilio</h2>
          <span className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[10.5px] font-medium ${
            data.connection_ok ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${data.connection_ok ? "bg-emerald-400" : "bg-rose-400"}`} />
            {data.connection_ok ? "Connessione OK" : "Connessione KO"}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-[12.5px]">
          <div>
            <dt className="text-slate-500">Account SID</dt>
            <dd className="font-mono text-slate-100">{data.master.account_sid || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Auth token ({data.master.auth_token_source})</dt>
            <dd className="font-mono text-slate-100">{data.master.auth_token_masked || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Messaging Service SID</dt>
            <dd className="font-mono text-slate-100">{data.master.messaging_service_sid || "—"}</dd>
          </div>
        </dl>
        <div className="mt-4 border-t border-slate-800 pt-4">
          <label className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wider text-slate-400">
            Ruota auth token master
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={rotateDraft}
              onChange={(e) => setRotateDraft(e.target.value)}
              placeholder="Incolla il nuovo auth token"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 font-mono text-[12.5px] text-slate-100"
            />
            <button
              type="button"
              onClick={handleRotate}
              disabled={rotateSaving || !rotateDraft.trim()}
              className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50"
            >
              {rotateSaving ? "Rotazione…" : "Ruota"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Il token viene cifrato AES-GCM prima del salvataggio in <code>system_config</code>. Non è mai restituito in chiaro dall&apos;API.
          </p>
        </div>
      </section>

      {/* Sezione 2: Provisioning policy */}
      <section className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
        <h2 className="mb-3 text-[15px] font-semibold text-slate-100">Policy di provisioning</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-[12.5px] text-slate-200">
            <input
              type="checkbox"
              checked={policyDraft.auto_create_subaccount_on_signup}
              onChange={(e) => setPolicyDraft({ ...policyDraft, auto_create_subaccount_on_signup: e.target.checked })}
              className="h-3.5 w-3.5"
            />
            Crea subaccount Twilio automaticamente al signup
          </label>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">Regione numero default</label>
            <input
              type="text"
              value={policyDraft.default_region}
              onChange={(e) => setPolicyDraft({ ...policyDraft, default_region: e.target.value.toUpperCase() })}
              className="w-32 rounded-sm border border-slate-700 bg-brand-navy-deep px-2 py-1.5 font-mono text-[12.5px] text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">Pool numeri (uno per riga)</label>
            <textarea
              value={policyDraft.number_pool.join("\n")}
              onChange={(e) => setPolicyDraft({
                ...policyDraft,
                number_pool: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
              })}
              rows={3}
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-2 py-1.5 font-mono text-[12.5px] text-slate-100"
              placeholder="+3902..."
            />
          </div>
          <button
            type="button"
            onClick={handlePolicySave}
            disabled={policySaving}
            className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50"
          >
            {policySaving ? "Salvataggio…" : "Salva policy"}
          </button>
        </div>
      </section>

      {/* Sezione 3: Subaccount overview */}
      <section className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-slate-100">Subaccount</h2>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtra per email o SID"
            className="rounded-sm border border-slate-700 bg-brand-navy-deep px-2 py-1 text-[12px] text-slate-100"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-500">
                <th className="py-1.5">Utente</th>
                <th>SID</th>
                <th className="text-right">Msg mese</th>
                <th className="text-right">Costo stimato</th>
                <th>Stato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleSubs.map((s) => (
                <tr key={s.subaccount_sid} className="border-b border-slate-800/50">
                  <td className="py-1.5 text-slate-200">{s.email}</td>
                  <td className="font-mono text-slate-400">{s.subaccount_sid.slice(0, 12)}…</td>
                  <td className="text-right text-slate-200">{s.messages_month}</td>
                  <td className="text-right text-slate-200">€{s.est_cost_eur.toFixed(2)}</td>
                  <td className="text-slate-400">{s.status || "—"}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => handleSuspend(s.subaccount_sid)}
                      className="text-[11px] text-rose-300 hover:text-rose-200"
                    >
                      Sospendi
                    </button>
                  </td>
                </tr>
              ))}
              {!visibleSubs.length && (
                <tr><td colSpan={6} className="py-3 text-center text-slate-500">Nessun subaccount.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sezione 4: Audit log Twilio */}
      <section className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
        <h2 className="mb-3 text-[15px] font-semibold text-slate-100">Audit log Twilio</h2>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-500">
                <th className="py-1.5">Data</th>
                <th>Action</th>
                <th>Target</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/50">
                  <td className="py-1.5 text-slate-400">{new Date(a.created_at).toLocaleString("it-IT")}</td>
                  <td className="font-mono text-slate-200">{a.action}</td>
                  <td className="font-mono text-slate-400">{a.target_id?.slice(0, 8) || "—"}</td>
                  <td className="text-[11px] text-slate-500">{JSON.stringify(a.metadata).slice(0, 80)}</td>
                </tr>
              ))}
              {!audit.length && (
                <tr><td colSpan={4} className="py-3 text-center text-slate-500">Nessuna azione registrata.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          L&apos;endpoint <code>GET /admin/audit?prefix=twilio_</code> è fuori scope da questo plan: se non esiste, la sezione mostrerà &quot;Nessuna azione&quot; senza errori (il fetch fa fallback a lista vuota su non-200).
        </p>
      </section>
    </div>
  );
}
