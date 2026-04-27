"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface StripePlan {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  stripe_price_id: string | null;
}

interface TopupPack {
  slug: string;
  credits: number;
  amount_cents: number;
  env_var: string;
  price_id: string;
}

interface WebhookEvent {
  stripe_event_id: string;
  event_type: string;
  status: "received" | "processed" | "error";
  error_message: string | null;
  payload_summary: Record<string, unknown> | null;
  received_at: string | null;
}

type CredentialSource = "db" | "env" | null;

interface StripeStatus {
  mode: "test" | "live" | null;
  balance_ok: boolean;
  balance_error: string | null;
  publishable_key_preview: string | null;
  webhook_url: string;
  checklist: Record<string, boolean>;
  sources?: {
    secret_key: CredentialSource;
    webhook_secret: CredentialSource;
    publishable_key: CredentialSource;
  };
  plans: StripePlan[];
  topup_packs: TopupPack[];
  webhook_events: WebhookEvent[];
}

const CHECKLIST_LABELS: Record<string, string> = {
  secret_key: "STRIPE_SECRET_KEY configurata",
  webhook_secret: "STRIPE_WEBHOOK_SECRET configurato",
  publishable_key: "Publishable key configurata",
  balance_ok: "Connessione API verificata",
  all_plans_priced: "Price ID assegnato a tutti i piani",
  all_topups_priced: "Price ID assegnato a tutti i top-up pack",
  webhook_received_recently: "Almeno un webhook ricevuto",
};

export function StripeConfigTab() {
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const [draftPriceIds, setDraftPriceIds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // Credentials form: never seeded with the actual secret — admin types fresh.
  const [credSecret, setCredSecret] = useState("");
  const [credWebhook, setCredWebhook] = useState("");
  const [credPublishable, setCredPublishable] = useState("");
  const [credSaving, setCredSaving] = useState(false);
  const [credSuccess, setCredSuccess] = useState<string | null>(null);

  function load() {
    setLoading(true);
    apiFetch("/admin/stripe/status")
      .then((r) => r.json())
      .then((d: StripeStatus) => {
        setStatus(d);
        const drafts: Record<string, string> = {};
        for (const p of d.plans) drafts[p.id] = p.stripe_price_id ?? "";
        setDraftPriceIds(drafts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(load, []);

  async function savePlanPriceId(plan: StripePlan) {
    setSavingPlan(plan.id);
    setError(null);
    const res = await apiFetch(`/admin/plans/${plan.id}/stripe-price-id`, {
      method: "PATCH",
      body: JSON.stringify({ stripe_price_id: draftPriceIds[plan.id] || null }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail || `Errore salvataggio piano ${plan.slug}`);
    } else {
      load();
    }
    setSavingPlan(null);
  }

  async function saveCredentials() {
    setCredSaving(true);
    setError(null);
    setCredSuccess(null);
    const payload: Record<string, string> = {};
    if (credSecret) payload.secret_key = credSecret;
    if (credWebhook) payload.webhook_secret = credWebhook;
    if (credPublishable) payload.publishable_key = credPublishable;
    if (Object.keys(payload).length === 0) {
      setError("Inserisci almeno una chiave da aggiornare.");
      setCredSaving(false);
      return;
    }
    const res = await apiFetch("/admin/stripe/credentials", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail || "Errore salvataggio credenziali Stripe.");
      setCredSaving(false);
      return;
    }
    const body = await res.json();
    const saved = (body.saved as string[] | undefined) ?? [];
    setCredSuccess(saved.length ? `Aggiornate: ${saved.join(", ")}` : "Salvataggio completato.");
    setCredSecret("");
    setCredWebhook("");
    setCredPublishable("");
    load();
    setCredSaving(false);
  }

  function sourceBadge(src: CredentialSource | undefined) {
    if (src === "db") return <span className="rounded-pill bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">DB</span>;
    if (src === "env") return <span className="rounded-pill bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">env</span>;
    return <span className="rounded-pill bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">non impostata</span>;
  }

  if (loading || !status) {
    return <div className="animate-pulse text-slate-500">Caricamento configurazione Stripe...</div>;
  }

  const modeLabel = status.mode === "live"
    ? <span className="rounded-pill bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300">LIVE</span>
    : status.mode === "test"
      ? <span className="rounded-pill bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">TEST</span>
      : <span className="rounded-pill bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300">non configurato</span>;

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-card border border-rose-500/30 bg-rose-500/10 p-3 text-[12.5px] text-rose-300">
          {error}
        </div>
      )}

      {/* Status card */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Stato connessione</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[15px] font-semibold text-slate-100">Stripe</span>
              {modeLabel}
              {status.balance_ok ? (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Connesso
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-rose-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  Non connesso
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-pill border border-slate-700 px-3 py-1.5 text-[11.5px] text-slate-300 hover:bg-brand-navy-deep"
          >
            Verifica
          </button>
        </div>

        {status.balance_error && (
          <div className="mt-2 rounded-sm border border-rose-500/30 bg-rose-500/10 p-2 text-[11.5px] text-rose-300">
            {status.balance_error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Webhook URL</div>
            <code className="mt-1 block truncate rounded-sm bg-brand-navy-deep px-2 py-1 text-[11px] text-slate-300">
              {status.webhook_url}
            </code>
            <div className="mt-1 text-[10.5px] text-slate-500">
              Configura questo URL su Stripe Dashboard → Webhooks
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Publishable key</div>
            <code className="mt-1 block truncate rounded-sm bg-brand-navy-deep px-2 py-1 text-[11px] text-slate-300">
              {status.publishable_key_preview ?? "non configurata"}
            </code>
            <div className="mt-1 text-[10.5px] text-slate-500">
              Variabile env: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
            </div>
          </div>
        </div>
      </div>

      {/* Chiavi API */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
        <div className="mb-3">
          <div className="text-[13px] font-semibold text-slate-100">Chiavi API Stripe</div>
          <div className="mt-0.5 text-[11.5px] text-slate-400">
            Salvate cifrate in <code className="text-slate-300">system_config</code>. Hanno priorità sulle variabili env. Lascia vuoto per non modificare; salva una stringa vuota tramite l&apos;admin per cancellare e tornare a env.
          </div>
        </div>

        {credSuccess && (
          <div className="mb-3 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
            {credSuccess}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <label className="text-[11.5px] font-medium text-slate-300">STRIPE_SECRET_KEY</label>
              {sourceBadge(status.sources?.secret_key)}
            </div>
            <input
              type="password"
              autoComplete="off"
              placeholder="sk_test_... o sk_live_... (lascia vuoto per non modificare)"
              value={credSecret}
              onChange={(e) => setCredSecret(e.target.value)}
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[12px] font-mono text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <label className="text-[11.5px] font-medium text-slate-300">STRIPE_WEBHOOK_SECRET</label>
              {sourceBadge(status.sources?.webhook_secret)}
            </div>
            <input
              type="password"
              autoComplete="off"
              placeholder="whsec_... (lascia vuoto per non modificare)"
              value={credWebhook}
              onChange={(e) => setCredWebhook(e.target.value)}
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[12px] font-mono text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <label className="text-[11.5px] font-medium text-slate-300">PUBLISHABLE_KEY</label>
              {sourceBadge(status.sources?.publishable_key)}
              <span className="text-[10.5px] text-slate-500">(non sensibile, opzionale)</span>
            </div>
            <input
              type="text"
              autoComplete="off"
              placeholder="pk_test_... o pk_live_..."
              value={credPublishable}
              onChange={(e) => setCredPublishable(e.target.value)}
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[12px] font-mono text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            Le chiavi inserite qui sostituiscono <code className="text-slate-400">.env</code> al prossimo richiamo Stripe (no restart).
          </div>
          <button
            type="button"
            onClick={saveCredentials}
            disabled={credSaving || (!credSecret && !credWebhook && !credPublishable)}
            className="shrink-0 rounded-pill bg-brand-teal px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-teal-dark disabled:opacity-40"
          >
            {credSaving ? "Salvataggio..." : "Salva chiavi"}
          </button>
        </div>
      </div>

      {/* Checklist */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
        <div className="mb-3 text-[13px] font-semibold text-slate-100">Checklist configurazione</div>
        <ul className="space-y-1.5">
          {Object.entries(status.checklist).map(([key, ok]) => (
            <li key={key} className="flex items-center gap-2 text-[12.5px]">
              {ok ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" className="h-3.5 w-3.5 shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="#fb7185" strokeWidth="2.5" className="h-3.5 w-3.5 shrink-0">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )}
              <span className={ok ? "text-slate-200" : "text-slate-400"}>
                {CHECKLIST_LABELS[key] ?? key}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Plan price IDs */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="text-[13px] font-semibold text-slate-100">Stripe Price ID dei piani</div>
            <div className="mt-0.5 text-[11.5px] text-slate-400">
              Modificabili — aggiornati direttamente in DB su <code className="text-slate-300">plans.stripe_price_id</code>.
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {status.plans.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2">
              <div className="w-32 shrink-0">
                <div className="text-[12.5px] font-medium text-slate-100 capitalize">{p.name}</div>
                <div className="text-[10.5px] text-slate-500">€{(p.price_cents / 100).toFixed(0)}/mese · {p.slug}</div>
              </div>
              <input
                type="text"
                placeholder="price_..."
                value={draftPriceIds[p.id] ?? ""}
                onChange={(e) => setDraftPriceIds({ ...draftPriceIds, [p.id]: e.target.value })}
                className="flex-1 min-w-0 rounded-sm border border-slate-700 bg-brand-navy-light px-2 py-1.5 text-[12px] font-mono text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
              />
              <button
                type="button"
                onClick={() => savePlanPriceId(p)}
                disabled={savingPlan === p.id || (draftPriceIds[p.id] ?? "") === (p.stripe_price_id ?? "")}
                className="shrink-0 rounded-pill bg-brand-teal px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-brand-teal-dark disabled:opacity-40"
              >
                {savingPlan === p.id ? "..." : "Salva"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Top-up packs (read-only) */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
        <div className="mb-3">
          <div className="text-[13px] font-semibold text-slate-100">Stripe Price ID dei top-up pack</div>
          <div className="mt-0.5 text-[11.5px] text-slate-400">
            Sola lettura — modificabili tramite variabili env e redeploy.
          </div>
        </div>
        <div className="space-y-1.5">
          {status.topup_packs.map((p) => (
            <div key={p.slug} className="flex items-center gap-3 rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2">
              <div className="w-32 shrink-0">
                <div className="text-[12.5px] font-medium text-slate-100 capitalize">{p.slug}</div>
                <div className="text-[10.5px] text-slate-500">{p.credits} crediti · €{(p.amount_cents / 100).toFixed(0)}</div>
              </div>
              <code className="flex-1 truncate text-[11.5px] text-slate-300">
                {p.price_id || <span className="text-rose-400">non configurato</span>}
              </code>
              <code className="shrink-0 text-[10.5px] text-slate-500">{p.env_var}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Webhook events log */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="text-[13px] font-semibold text-slate-100">Eventi webhook recenti</div>
            <div className="mt-0.5 text-[11.5px] text-slate-400">Ultimi 50 eventi ricevuti.</div>
          </div>
        </div>
        {status.webhook_events.length === 0 ? (
          <div className="rounded-sm border border-slate-800 bg-brand-navy-deep p-4 text-center text-[12px] text-slate-500">
            Nessun evento ricevuto. Verifica la configurazione del webhook su Stripe Dashboard.
          </div>
        ) : (
          <div className="space-y-1">
            {status.webhook_events.map((e) => (
              <div key={e.stripe_event_id} className="flex items-center gap-3 rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    e.status === "processed" ? "bg-emerald-400" :
                    e.status === "error" ? "bg-rose-400" :
                    "bg-amber-400"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-[11.5px] text-slate-200">{e.event_type}</code>
                    <span className="text-[10px] text-slate-500">{e.stripe_event_id.slice(0, 16)}...</span>
                  </div>
                  {e.error_message && (
                    <div className="mt-0.5 truncate text-[10.5px] text-rose-300">{e.error_message}</div>
                  )}
                </div>
                <span className="shrink-0 text-[10.5px] text-slate-500">
                  {e.received_at ? new Date(e.received_at).toLocaleString("it-IT", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                  }) : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dev guidance */}
      <div className="rounded-card border border-slate-800 bg-brand-navy-deep p-4 text-[11.5px] text-slate-400">
        <div className="mb-1 font-semibold text-slate-300">In sviluppo locale</div>
        <div>
          Forwardare i webhook con il CLI Stripe:
          <code className="mx-1 rounded-sm bg-brand-navy px-1.5 py-0.5 text-slate-200">
            stripe listen --forward-to localhost:8100/api/v1/billing/webhook
          </code>
          poi copia <code className="text-slate-300">whsec_...</code> in <code className="text-slate-300">STRIPE_WEBHOOK_SECRET</code>.
        </div>
      </div>
    </div>
  );
}
