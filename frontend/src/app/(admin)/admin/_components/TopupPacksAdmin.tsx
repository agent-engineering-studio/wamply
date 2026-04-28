"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface TopupPack {
  id: string;
  slug: string;
  name: string;
  credits: number;
  amount_cents: number;
  currency: string;
  badge: string | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  stripe_price_id_source: "db" | "env" | null;
  active: boolean;
  sort_order: number;
}

interface SyncResult {
  examined: number;
  linked: Array<{
    slug: string;
    stripe_product_id: string;
    stripe_price_id: string;
    product_name: string;
  }>;
  skipped: Array<{
    product_id?: string;
    product_name?: string;
    slug?: string;
    reason: string;
  }>;
}

type DraftPack = Omit<TopupPack, "id" | "stripe_price_id_source">;

const EMPTY_DRAFT: DraftPack = {
  slug: "",
  name: "",
  credits: 100,
  amount_cents: 1000,
  currency: "eur",
  badge: null,
  stripe_product_id: null,
  stripe_price_id: null,
  active: true,
  sort_order: 0,
};

function sourceBadge(src: "db" | "env" | null) {
  if (src === "db") {
    return (
      <span className="rounded-pill bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-medium text-emerald-300">
        DB
      </span>
    );
  }
  if (src === "env") {
    return (
      <span className="rounded-pill bg-slate-700 px-1.5 py-0.5 text-[9.5px] font-medium text-slate-300">
        ENV
      </span>
    );
  }
  return (
    <span className="rounded-pill bg-rose-500/15 px-1.5 py-0.5 text-[9.5px] font-medium text-rose-300">
      —
    </span>
  );
}

export function TopupPacksAdmin() {
  const [packs, setPacks] = useState<TopupPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // pack id being edited, or "new"
  const [draft, setDraft] = useState<DraftPack>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  function load() {
    setLoading(true);
    apiFetch("/admin/topup-packs")
      .then((r) => r.json())
      .then((d: { packs: TopupPack[] }) => {
        setPacks(d.packs);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }

  useEffect(load, []);

  function startEdit(pack: TopupPack) {
    setEditing(pack.id);
    setDraft({
      slug: pack.slug,
      name: pack.name,
      credits: pack.credits,
      amount_cents: pack.amount_cents,
      currency: pack.currency,
      badge: pack.badge,
      stripe_product_id: pack.stripe_product_id,
      stripe_price_id: pack.stripe_price_id,
      active: pack.active,
      sort_order: pack.sort_order,
    });
    setError(null);
    setInfo(null);
  }

  function startCreate() {
    setEditing("new");
    setDraft(EMPTY_DRAFT);
    setError(null);
    setInfo(null);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setInfo(null);
    const isNew = editing === "new";
    const url = isNew ? "/admin/topup-packs" : `/admin/topup-packs/${editing}`;
    const method = isNew ? "POST" : "PATCH";

    // Strip empty strings to nulls for optional fields.
    const payload: Record<string, unknown> = {
      slug: draft.slug.trim(),
      name: draft.name.trim(),
      credits: draft.credits,
      amount_cents: draft.amount_cents,
      currency: draft.currency.trim() || "eur",
      badge: draft.badge?.trim() || null,
      stripe_product_id: draft.stripe_product_id?.trim() || null,
      stripe_price_id: draft.stripe_price_id?.trim() || null,
      active: draft.active,
      sort_order: draft.sort_order,
    };

    const res = await apiFetch(url, {
      method,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail || `Errore salvataggio (HTTP ${res.status})`);
      setSaving(false);
      return;
    }
    setInfo(isNew ? "Pacchetto creato." : "Pacchetto aggiornato.");
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setSaving(false);
    load();
  }

  async function deactivate(pack: TopupPack) {
    if (!confirm(`Disattivare il pacchetto "${pack.name}"? Non sarà più visibile agli utenti.`)) {
      return;
    }
    setError(null);
    const res = await apiFetch(`/admin/topup-packs/${pack.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail || "Errore disattivazione.");
      return;
    }
    setInfo(`Pacchetto "${pack.name}" disattivato.`);
    load();
  }

  async function sync() {
    setSyncing(true);
    setError(null);
    setInfo(null);
    setSyncResult(null);
    const res = await apiFetch("/admin/topup-packs/sync-from-stripe", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail || `Errore sync (HTTP ${res.status})`);
      setSyncing(false);
      return;
    }
    const result = (await res.json()) as SyncResult;
    setSyncResult(result);
    setInfo(
      `Sync completato: ${result.linked.length} collegati, ${result.skipped.length} saltati.`,
    );
    setSyncing(false);
    load();
  }

  if (loading) {
    return <div className="animate-pulse text-slate-500">Caricamento top-up pack...</div>;
  }

  return (
    <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-slate-100">
            Top-up pack crediti AI
          </div>
          <div className="mt-0.5 text-[11.5px] text-slate-400">
            Listino dei pacchetti acquistabili da{" "}
            <code className="text-slate-300">/settings/credits</code>. Editabili
            qui — niente redeploy.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={sync}
            disabled={syncing}
            title="Pulla i Stripe Product taggati metadata.wamply_type=topup e collega gli stripe_price_id dove combacia il slug"
            className="rounded-pill border border-slate-700 px-3 py-1.5 text-[11.5px] font-medium text-slate-200 hover:bg-brand-navy-deep disabled:opacity-40"
          >
            {syncing ? "Sync in corso..." : "Sync da Stripe"}
          </button>
          <button
            type="button"
            onClick={startCreate}
            disabled={editing !== null}
            className="rounded-pill bg-brand-teal px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-brand-teal-dark disabled:opacity-40"
          >
            + Nuovo pack
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 p-2 text-[11.5px] text-rose-300">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-3 rounded-sm border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11.5px] text-emerald-300">
          {info}
        </div>
      )}

      {syncResult && syncResult.skipped.length > 0 && (
        <div className="mb-3 rounded-sm border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          <div className="font-semibold mb-1">Saltati durante il sync ({syncResult.skipped.length}):</div>
          <ul className="space-y-0.5 pl-2">
            {syncResult.skipped.map((s, i) => (
              <li key={i}>
                · {s.product_name ?? s.product_id ?? "?"}
                {s.slug && <span className="text-slate-400"> [{s.slug}]</span>}
                <span className="text-amber-300"> — {s.reason}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[10.5px] text-amber-200/70">
            Per linkare un Product, taggalo su Stripe con{" "}
            <code>metadata.wamply_type = "topup"</code> e{" "}
            <code>metadata.wamply_slug = "small|medium|...".</code>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {packs.length === 0 && (
          <div className="rounded-sm border border-slate-800 bg-brand-navy-deep p-4 text-center text-[12px] text-slate-500">
            Nessun pacchetto top-up configurato. Crea il primo o sincronizza da Stripe.
          </div>
        )}

        {packs.map((p) => {
          const isEditing = editing === p.id;
          if (isEditing) {
            return (
              <PackForm
                key={p.id}
                draft={draft}
                setDraft={setDraft}
                onSave={save}
                onCancel={cancelEdit}
                saving={saving}
                isNew={false}
              />
            );
          }
          return (
            <div
              key={p.id}
              className={`flex flex-wrap items-center gap-3 rounded-sm border px-3 py-2 ${
                p.active
                  ? "border-slate-800 bg-brand-navy-deep"
                  : "border-slate-800/60 bg-brand-navy-deep/40 opacity-60"
              }`}
            >
              <div className="w-40 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-medium text-slate-100">
                    {p.name}
                  </span>
                  {p.badge && (
                    <span className="rounded-pill bg-brand-teal/20 px-1.5 py-0.5 text-[9.5px] font-medium text-brand-teal">
                      {p.badge}
                    </span>
                  )}
                  {!p.active && (
                    <span className="rounded-pill bg-slate-700 px-1.5 py-0.5 text-[9.5px] font-medium text-slate-400">
                      disattivato
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] text-slate-500">
                  {p.credits.toLocaleString("it-IT")} crediti · €
                  {(p.amount_cents / 100).toFixed(2)} · {p.slug}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {sourceBadge(p.stripe_price_id_source)}
                <code className="truncate text-[11px] text-slate-300">
                  {p.stripe_price_id || (
                    <span className="text-rose-400">price_id mancante</span>
                  )}
                </code>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  disabled={editing !== null}
                  className="rounded-pill border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-brand-navy-light disabled:opacity-40"
                >
                  Modifica
                </button>
                {p.active && (
                  <button
                    type="button"
                    onClick={() => deactivate(p)}
                    disabled={editing !== null}
                    className="rounded-pill border border-rose-500/40 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                  >
                    Disattiva
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {editing === "new" && (
          <PackForm
            draft={draft}
            setDraft={setDraft}
            onSave={save}
            onCancel={cancelEdit}
            saving={saving}
            isNew={true}
          />
        )}
      </div>

      <div className="mt-4 rounded-sm border border-slate-800 bg-brand-navy-deep p-3 text-[10.5px] text-slate-400">
        <div className="mb-1 font-semibold text-slate-300">Sync da Stripe — come funziona</div>
        <div className="space-y-1">
          <div>
            1. Su Stripe Dashboard, crea un <strong>Product</strong> e aggiungi
            i metadata: <code className="text-slate-300">wamply_type = topup</code>{" "}
            e <code className="text-slate-300">wamply_slug = &lt;slug&gt;</code>
            (es. <code className="text-slate-300">small</code>).
          </div>
          <div>
            2. Crea un <strong>Price</strong> one-time (no recurring) sotto quel
            Product.
          </div>
          <div>
            3. Premi "Sync da Stripe" qui sopra. Il backend popolerà{" "}
            <code className="text-slate-300">stripe_price_id</code> sui pack
            con slug corrispondente.
          </div>
          <div className="text-slate-500">
            Stripe è in <strong>read-only</strong>: il sync non crea né modifica
            oggetti su Stripe.
          </div>
        </div>
      </div>
    </div>
  );
}

interface PackFormProps {
  draft: DraftPack;
  setDraft: (d: DraftPack) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}

function PackForm({ draft, setDraft, onSave, onCancel, saving, isNew }: PackFormProps) {
  function update<K extends keyof DraftPack>(key: K, value: DraftPack[K]) {
    setDraft({ ...draft, [key]: value });
  }

  return (
    <div className="rounded-sm border border-brand-teal/40 bg-brand-navy-deep p-3">
      <div className="mb-2 text-[12px] font-semibold text-brand-teal">
        {isNew ? "Nuovo pacchetto" : `Modifica: ${draft.slug}`}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Field label="Slug">
          <input
            type="text"
            value={draft.slug}
            onChange={(e) => update("slug", e.target.value)}
            disabled={!isNew}
            placeholder="es. small"
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-light px-2 py-1 text-[12px] font-mono text-slate-100 disabled:opacity-50"
          />
        </Field>
        <Field label="Nome visibile">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="es. 100 crediti"
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-light px-2 py-1 text-[12px] text-slate-100"
          />
        </Field>
        <Field label="Crediti">
          <input
            type="number"
            min={1}
            value={draft.credits}
            onChange={(e) => update("credits", parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-light px-2 py-1 text-[12px] text-slate-100"
          />
        </Field>
        <Field label="Importo (cent EUR)" hint="es. 5900 = €59,00">
          <input
            type="number"
            min={1}
            value={draft.amount_cents}
            onChange={(e) => update("amount_cents", parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-light px-2 py-1 text-[12px] text-slate-100"
          />
        </Field>
        <Field label="Valuta" hint="lowercase ISO 4217">
          <input
            type="text"
            value={draft.currency}
            onChange={(e) => update("currency", e.target.value.toLowerCase())}
            placeholder="eur"
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-light px-2 py-1 text-[12px] font-mono text-slate-100"
          />
        </Field>
        <Field label="Badge (opzionale)">
          <input
            type="text"
            value={draft.badge ?? ""}
            onChange={(e) => update("badge", e.target.value || null)}
            placeholder="es. Più venduto"
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-light px-2 py-1 text-[12px] text-slate-100"
          />
        </Field>
        <Field label="Ordine" hint="ascendente = mostrato prima">
          <input
            type="number"
            min={0}
            value={draft.sort_order}
            onChange={(e) => update("sort_order", parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-light px-2 py-1 text-[12px] text-slate-100"
          />
        </Field>
        <Field label="Attivo">
          <label className="flex items-center gap-2 px-1 py-1 text-[12px] text-slate-200">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => update("active", e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-brand-navy-light"
            />
            Visibile agli utenti
          </label>
        </Field>
        <Field label="Stripe Product ID" hint="opzionale, popolato da Sync">
          <input
            type="text"
            value={draft.stripe_product_id ?? ""}
            onChange={(e) => update("stripe_product_id", e.target.value || null)}
            placeholder="prod_..."
            className="col-span-2 w-full rounded-sm border border-slate-700 bg-brand-navy-light px-2 py-1 text-[12px] font-mono text-slate-100"
          />
        </Field>
        <Field label="Stripe Price ID" hint="popolato da Sync o manuale">
          <input
            type="text"
            value={draft.stripe_price_id ?? ""}
            onChange={(e) => update("stripe_price_id", e.target.value || null)}
            placeholder="price_..."
            className="col-span-2 w-full rounded-sm border border-slate-700 bg-brand-navy-light px-2 py-1 text-[12px] font-mono text-slate-100"
          />
        </Field>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-pill border border-slate-700 px-3 py-1.5 text-[11.5px] text-slate-200 hover:bg-brand-navy-light disabled:opacity-40"
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !draft.slug || !draft.name || !draft.credits || !draft.amount_cents}
          className="rounded-pill bg-brand-teal px-4 py-1.5 text-[11.5px] font-semibold text-white hover:bg-brand-teal-dark disabled:opacity-40"
        >
          {saving ? "Salvataggio..." : isNew ? "Crea" : "Salva"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[10.5px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      {children}
      {hint && <div className="mt-0.5 text-[9.5px] text-slate-600">{hint}</div>}
    </div>
  );
}
