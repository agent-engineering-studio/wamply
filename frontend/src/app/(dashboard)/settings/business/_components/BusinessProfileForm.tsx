"use client";

import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement } from "react";
import { apiFetch } from "@/lib/api-client";

interface Business {
  id?: string;
  legal_name: string;
  brand_name: string;
  vat_number: string | null;
  tax_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  region: string | null;
  country: string;
  business_phone: string | null;
  business_email: string | null;
  website_url: string | null;
  logo_url: string | null;
  meta_category: string | null;
}

interface MetaApplication {
  status: string;
  twilio_phone_number: string | null;
  meta_display_name_approved: string | null;
  meta_rejection_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  activated_at: string | null;
}

const EMPTY: Business = {
  legal_name: "",
  brand_name: "",
  vat_number: null,
  tax_code: null,
  address_line1: null,
  address_line2: null,
  city: null,
  postal_code: null,
  region: null,
  country: "IT",
  business_phone: null,
  business_email: null,
  website_url: null,
  logo_url: null,
  meta_category: null,
};

// Meta business categories (from Meta's predefined taxonomy, semplified)
const META_CATEGORIES = [
  { value: "RETAIL", label: "Commercio al dettaglio" },
  { value: "RESTAURANT", label: "Ristorazione" },
  { value: "HEALTH", label: "Salute e benessere" },
  { value: "BEAUTY", label: "Bellezza e cura persona" },
  { value: "PROFESSIONAL_SERVICES", label: "Servizi professionali" },
  { value: "EDUCATION", label: "Formazione" },
  { value: "HOTEL", label: "Hotel e alloggi" },
  { value: "TRAVEL", label: "Viaggi" },
  { value: "AUTOMOTIVE", label: "Automotive" },
  { value: "ENTERTAINMENT", label: "Intrattenimento" },
  { value: "NON_PROFIT", label: "Non profit" },
  { value: "OTHER", label: "Altro" },
];

const STATUS_META: Record<string, { label: string; tone: "slate" | "amber" | "blue" | "emerald" | "rose" }> = {
  draft: { label: "In preparazione", tone: "slate" },
  awaiting_docs: { label: "In attesa documenti", tone: "amber" },
  submitted_to_meta: { label: "Inviata a Meta", tone: "blue" },
  in_review: { label: "In revisione Meta", tone: "blue" },
  approved: { label: "Approvata", tone: "emerald" },
  rejected: { label: "Rifiutata", tone: "rose" },
  active: { label: "Attiva", tone: "emerald" },
  suspended: { label: "Sospesa", tone: "rose" },
};

export function BusinessProfileForm() {
  const [business, setBusiness] = useState<Business>(EMPTY);
  const [meta, setMeta] = useState<MetaApplication | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    apiFetch("/settings/business")
      .then((r) => r.json())
      .then((d) => {
        if (d.business) setBusiness({ ...EMPTY, ...d.business });
        setMeta(d.meta_application);
        setMissing(d.missing_fields || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function setField<K extends keyof Business>(key: K, value: Business[K]) {
    setBusiness((b) => ({ ...b, [key]: value }));
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(business)) {
      if (k === "id") continue;
      payload[k] = v === "" ? null : v;
    }

    const res = await apiFetch("/settings/business", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.detail || "Errore nel salvataggio.");
      setSaving(false);
      return;
    }
    setBusiness({ ...EMPTY, ...body.business });
    setMeta(body.meta_application);
    setMissing(body.missing_fields || []);
    setSaving(false);
    setSuccess(true);
  }

  if (loading) {
    return <div className="animate-pulse rounded-card bg-brand-navy-light p-8 text-slate-500">Caricamento...</div>;
  }

  const statusMeta = meta?.status ? STATUS_META[meta.status] : null;
  const isEditingBlocked =
    meta?.status === "submitted_to_meta" || meta?.status === "in_review" ||
    meta?.status === "approved" || meta?.status === "active";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Status banner */}
      {statusMeta && meta && (
        <MetaStatusBanner meta={meta} tone={statusMeta.tone} label={statusMeta.label} />
      )}

      {isEditingBlocked && (
        <div className="rounded-card border border-amber-500/30 bg-amber-500/10 p-4 text-[12.5px] text-amber-200">
          La tua pratica è già stata inviata a Meta. Modifiche ai dati ora possono richiedere di rifare
          la procedura — contattaci prima di cambiare campi chiave (ragione sociale, PIVA, nome brand).
        </div>
      )}

      {missing.length > 0 && !isEditingBlocked && (
        <div className="rounded-card border border-amber-500/30 bg-amber-500/10 p-4 text-[12.5px] text-amber-200">
          Mancano <strong>{missing.length}</strong> campi obbligatori prima di poter attivare WhatsApp.
          Salva quello che hai, aggiungi gli altri quando ti arrivano.
        </div>
      )}

      {error && (
        <div className="rounded-card border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-card border border-emerald-500/30 bg-emerald-500/10 p-4 text-[13px] text-emerald-300">
          Dati salvati correttamente.
        </div>
      )}

      {/* Section 1: Identity */}
      <FormSection title="Identità dell'azienda" subtitle="Come appari nei documenti ufficiali.">
        <Field label="Ragione sociale" required>
          <input
            type="text"
            value={business.legal_name}
            onChange={(e) => setField("legal_name", e.target.value)}
            required
            placeholder="Es: Pizzeria Mario di Rossi Mario & C. s.n.c."
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </Field>
        <Field label="Nome commerciale (brand)" required hint="Come appare su WhatsApp ai destinatari. Max 20 caratteri consigliati per Meta.">
          <input
            type="text"
            value={business.brand_name}
            onChange={(e) => setField("brand_name", e.target.value)}
            maxLength={30}
            required
            placeholder="Es: Pizzeria Mario"
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </Field>
        <Row>
          <Field label="Partita IVA" required>
            <input
              type="text"
              value={business.vat_number ?? ""}
              onChange={(e) => setField("vat_number", e.target.value)}
              placeholder="IT12345678901"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </Field>
          <Field label="Codice fiscale">
            <input
              type="text"
              value={business.tax_code ?? ""}
              onChange={(e) => setField("tax_code", e.target.value)}
              placeholder="(se diverso dalla P.IVA)"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </Field>
        </Row>
        <Field label="Categoria attività" required>
          <select
            value={business.meta_category ?? ""}
            onChange={(e) => setField("meta_category", e.target.value || null)}
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          >
            <option value="">Seleziona...</option>
            {META_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
      </FormSection>

      {/* Section 2: Address */}
      <FormSection title="Sede legale" subtitle="Indirizzo registrato presso la Camera di Commercio.">
        <Field label="Indirizzo" required>
          <input
            type="text"
            value={business.address_line1 ?? ""}
            onChange={(e) => setField("address_line1", e.target.value)}
            placeholder="Via, numero civico"
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </Field>
        <Field label="Complemento indirizzo">
          <input
            type="text"
            value={business.address_line2 ?? ""}
            onChange={(e) => setField("address_line2", e.target.value)}
            placeholder="Scala, piano, interno"
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </Field>
        <Row>
          <Field label="Città" required>
            <input
              type="text"
              value={business.city ?? ""}
              onChange={(e) => setField("city", e.target.value)}
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </Field>
          <Field label="CAP" required>
            <input
              type="text"
              value={business.postal_code ?? ""}
              onChange={(e) => setField("postal_code", e.target.value)}
              maxLength={10}
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </Field>
          <Field label="Provincia">
            <input
              type="text"
              value={business.region ?? ""}
              onChange={(e) => setField("region", e.target.value)}
              maxLength={4}
              placeholder="MI, RM, ..."
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </Field>
        </Row>
        <Field label="Paese" required>
          <select
            value={business.country}
            onChange={(e) => setField("country", e.target.value)}
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          >
            <option value="IT">Italia</option>
            <option value="FR">Francia</option>
            <option value="DE">Germania</option>
            <option value="ES">Spagna</option>
            <option value="CH">Svizzera</option>
          </select>
        </Field>
      </FormSection>

      {/* Section 3: Contacts */}
      <FormSection title="Contatti business" subtitle="Questi dati vengono inviati a Meta per la verifica.">
        <Field label="Telefono business" required hint="Numero che diventerà il sender WhatsApp ufficiale. Formato internazionale: +39 ...">
          <input
            type="tel"
            value={business.business_phone ?? ""}
            onChange={(e) => setField("business_phone", e.target.value)}
            placeholder="+39 02 12345678"
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </Field>
        <Field label="Email business" required>
          <input
            type="email"
            value={business.business_email ?? ""}
            onChange={(e) => setField("business_email", e.target.value)}
            placeholder="info@tuaazienda.it"
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </Field>
        <Field label="Sito web">
          <input
            type="url"
            value={business.website_url ?? ""}
            onChange={(e) => setField("website_url", e.target.value)}
            placeholder="https://www.tuaazienda.it"
            className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </Field>
      </FormSection>

      {/* Section 4: Logo */}
      <FormSection title="Logo" subtitle="Il logo appare accanto al tuo brand su WhatsApp.">
        {business.logo_url ? (
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 overflow-hidden rounded-full border border-slate-700 bg-brand-navy-deep">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={business.logo_url} alt="Logo" className="h-full w-full object-cover" />
            </div>
            <div className="flex-1 text-[12.5px] text-slate-300">
              Logo caricato. Per sostituirlo, scrivici a <strong>supporto@wamply.com</strong> con il nuovo file.
            </div>
          </div>
        ) : (
          <div className="rounded-sm border border-dashed border-slate-700 bg-brand-navy-deep p-6 text-center">
            <div className="text-[12.5px] text-slate-400">
              Non hai ancora caricato il logo. Inviacelo via email a <strong className="text-brand-teal">supporto@wamply.com</strong>,
              o richiedi assistenza — lo carichiamo noi al posto tuo.
            </div>
          </div>
        )}
      </FormSection>

      {/* Submit */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-[11.5px] text-slate-400">
          I campi con <span className="text-rose-400">*</span> sono obbligatori per l&apos;attivazione WhatsApp.
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-pill bg-brand-teal px-5 py-2.5 text-[13px] font-semibold text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Salva dati"}
        </button>
      </div>
    </form>
  );
}


// ── Small helpers ───────────────────────────────────────────

function MetaStatusBanner({
  meta,
  tone,
  label,
}: {
  meta: MetaApplication;
  tone: "slate" | "amber" | "blue" | "emerald" | "rose";
  label: string;
}) {
  const palette = {
    slate: { border: "border-slate-700", bg: "bg-slate-800/30", text: "text-slate-200" },
    amber: { border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-200" },
    blue: { border: "border-blue-500/30", bg: "bg-blue-500/10", text: "text-blue-200" },
    emerald: { border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-200" },
    rose: { border: "border-rose-500/30", bg: "bg-rose-500/10", text: "text-rose-200" },
  }[tone];

  const waitMsg =
    meta.status === "submitted_to_meta" || meta.status === "in_review"
      ? "I tempi di Meta vanno da 3 a 14 giorni e non dipendono da Wamply. Ti avviseremo via email appena arriva la risposta."
      : null;

  return (
    <div className={`rounded-card border ${palette.border} ${palette.bg} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`text-[13px] font-semibold ${palette.text}`}>
          Stato WhatsApp: {label}
        </div>
        {meta.twilio_phone_number && (
          <div className="text-[11.5px] text-slate-400">
            Numero assegnato: <span className="text-slate-200">{meta.twilio_phone_number}</span>
          </div>
        )}
      </div>
      {waitMsg && (
        <div className="mt-2 text-[11.5px] text-slate-300">{waitMsg}</div>
      )}
      {meta.status === "rejected" && meta.meta_rejection_reason && (
        <div className="mt-2 text-[11.5px] text-rose-300">
          Motivo: {meta.meta_rejection_reason}
        </div>
      )}
      {meta.status === "approved" && meta.meta_display_name_approved && (
        <div className="mt-2 text-[11.5px] text-emerald-300">
          Nome approvato: <strong>{meta.meta_display_name_approved}</strong>
        </div>
      )}
    </div>
  );
}

function FormSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
      <h2 className="text-[14px] font-semibold text-slate-100">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[11.5px] text-slate-400">{subtitle}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  // Inject id into the child control so the <label htmlFor> binds correctly
  // (required for a11y — linter flags unlinked selects/inputs as errors).
  const controlWithId = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11.5px] font-medium text-slate-200">
        {label}
        {required && <span className="ml-1 text-rose-400">*</span>}
      </label>
      {controlWithId}
      {hint && <p className="mt-1 text-[10.5px] text-slate-500">{hint}</p>}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
