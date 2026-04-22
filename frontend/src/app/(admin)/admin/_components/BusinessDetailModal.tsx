"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Business {
  id: string;
  user_id: string;
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
  created_at: string;
  updated_at: string;
}

interface MetaApplication {
  id: string;
  business_id: string;
  status: string;
  twilio_subaccount_sid: string | null;
  twilio_phone_number: string | null;
  twilio_phone_number_sid: string | null;
  twilio_whatsapp_sender_sid: string | null;
  twilio_messaging_service_sid: string | null;
  meta_waba_id: string | null;
  meta_display_name_approved: string | null;
  meta_rejection_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  activated_at: string | null;
  suspended_at: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditEntry {
  id: string;
  action: string;
  actor_email: string | null;
  actor_name: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "draft", label: "In preparazione" },
  { value: "awaiting_docs", label: "Attesa documenti dal cliente" },
  { value: "submitted_to_meta", label: "Inviata a Meta" },
  { value: "in_review", label: "In revisione Meta" },
  { value: "approved", label: "Approvata" },
  { value: "rejected", label: "Rifiutata" },
  { value: "active", label: "Attiva (primo invio)" },
  { value: "suspended", label: "Sospesa da Meta" },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveLogoSrc(logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  if (/^https?:\/\//.test(logoUrl)) return logoUrl;
  // Relative path returned by backend: prefix with Kong base + /api/v1
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:8100";
  return `${base}/api/v1${logoUrl}`;
}

// Meta category dropdown (same taxonomy as user-facing form)
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

export function BusinessDetailModal({
  businessId,
  onClose,
  onUpdated,
}: {
  businessId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [meta, setMeta] = useState<MetaApplication | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [savingStatus, setSavingStatus] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [provisioning, setProvisioning] = useState<null | "subaccount" | "number">(null);
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Partial<Business>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Status change form state
  const [newStatus, setNewStatus] = useState<string>("");
  const [adminNotesDraft, setAdminNotesDraft] = useState<string>("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [displayName, setDisplayName] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    const res = await apiFetch(`/admin/businesses/${businessId}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail || "Errore caricamento.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setBusiness(data.business);
    setMeta(data.meta_application);
    setAudit(data.audit_log || []);
    setMissing(data.missing_fields || []);
    setNewStatus(data.meta_application?.status ?? "draft");
    setAdminNotesDraft(data.meta_application?.admin_notes ?? "");
    setRejectionReason(data.meta_application?.meta_rejection_reason ?? "");
    setWabaId(data.meta_application?.meta_waba_id ?? "");
    setDisplayName(data.meta_application?.meta_display_name_approved ?? "");
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function handleStatusChange() {
    if (!meta) return;
    setSavingStatus(true);
    setError(null);
    const payload: Record<string, string> = { status: newStatus };
    if (newStatus === "rejected" && rejectionReason.trim()) payload.rejection_reason = rejectionReason.trim();
    if (newStatus === "approved" && wabaId.trim()) payload.waba_id = wabaId.trim();
    if (newStatus === "approved" && displayName.trim()) payload.display_name = displayName.trim();

    const res = await apiFetch(`/admin/meta-applications/${meta.id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.detail || "Errore cambio stato.");
      setSavingStatus(false);
      return;
    }
    setMeta(body.meta_application);
    setSavingStatus(false);
    await load();
    onUpdated();
  }

  async function handleNotesSave() {
    if (!meta) return;
    setSavingNotes(true);
    setError(null);
    const res = await apiFetch(`/admin/meta-applications/${meta.id}/notes`, {
      method: "PATCH",
      body: JSON.stringify({ admin_notes: adminNotesDraft }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail || "Errore salvataggio note.");
      setSavingNotes(false);
      return;
    }
    setSavingNotes(false);
    await load();
  }

  async function handleCreateSubaccount() {
    if (!meta) return;
    if (!confirm("Creare subaccount Twilio per questo cliente? L'operazione è gratuita ma crea un nuovo account su Twilio.")) return;
    setProvisioning("subaccount");
    setError(null);
    setProvisionMsg(null);
    const res = await apiFetch(`/admin/meta-applications/${meta.id}/create-subaccount`, {
      method: "POST",
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.detail || "Errore creazione subaccount.");
      setProvisioning(null);
      return;
    }
    setProvisionMsg(
      body.already_exists
        ? "Subaccount già esistente."
        : `Subaccount creato: ${body.twilio_subaccount_sid}`
    );
    setProvisioning(null);
    await load();
    onUpdated();
  }

  async function handlePurchaseNumber() {
    if (!meta) return;
    if (!confirm("Acquistare un numero italiano su Twilio? Costa circa €1/mese, addebitato sul master account.")) return;
    setProvisioning("number");
    setError(null);
    setProvisionMsg(null);
    const res = await apiFetch(`/admin/meta-applications/${meta.id}/purchase-number`, {
      method: "POST",
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.detail || "Errore acquisto numero.");
      setProvisioning(null);
      return;
    }
    setProvisionMsg(
      body.already_exists
        ? `Numero già assegnato: ${body.twilio_phone_number}`
        : `Numero acquistato: ${body.twilio_phone_number}`
    );
    setProvisioning(null);
    await load();
    onUpdated();
  }

  function handleEditStart() {
    if (!business) return;
    setEditDraft({
      legal_name: business.legal_name,
      brand_name: business.brand_name,
      vat_number: business.vat_number,
      tax_code: business.tax_code,
      address_line1: business.address_line1,
      address_line2: business.address_line2,
      city: business.city,
      postal_code: business.postal_code,
      region: business.region,
      country: business.country,
      business_phone: business.business_phone,
      business_email: business.business_email,
      website_url: business.website_url,
      meta_category: business.meta_category,
    });
    setEditing(true);
    setError(null);
  }

  function handleEditCancel() {
    setEditDraft({});
    setEditing(false);
  }

  async function handleEditSave() {
    if (!business) return;
    setSavingEdit(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(editDraft)) {
      payload[k] = v === "" ? null : v;
    }
    const res = await apiFetch(`/admin/businesses/${business.id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.detail || "Errore nel salvataggio.");
      setSavingEdit(false);
      return;
    }
    setEditing(false);
    setEditDraft({});
    setSavingEdit(false);
    await load();
    onUpdated();
  }

  async function handleLogoUpload(fileList: FileList | null) {
    if (!business || !fileList || fileList.length === 0) return;
    const file = fileList[0];
    setUploadingLogo(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);

    // apiFetch sets Content-Type: application/json by default which breaks multipart.
    // Bypass: fetch directly with auth header.
    const supabase = (await import("@/lib/supabase/client")).createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const KONG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:8100";

    const res = await fetch(`${KONG_URL}/api/v1/admin/businesses/${business.id}/logo`, {
      method: "POST",
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.detail || "Errore upload logo.");
      setUploadingLogo(false);
      return;
    }
    setUploadingLogo(false);
    await load();
    onUpdated();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-card border border-slate-800 bg-brand-navy-light shadow-card"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-800 bg-brand-navy-light p-5">
          <div className="min-w-0">
            <div className="text-[16px] font-semibold text-slate-100">
              {business?.brand_name ?? "Caricamento..."}
            </div>
            {business && (
              <div className="mt-0.5 text-[11.5px] text-slate-400">
                {business.legal_name} · P.IVA {business.vat_number || "—"}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-sm p-1.5 text-slate-400 hover:bg-brand-navy-deep hover:text-slate-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="animate-pulse p-8 text-[12.5px] text-slate-500">Caricamento...</div>
        ) : !business ? (
          <div className="p-8 text-[12.5px] text-rose-300">{error || "Business non trovato."}</div>
        ) : (
          <div className="space-y-5 p-5">
            {error && (
              <div className="rounded-sm border border-rose-500/30 bg-rose-500/10 p-3 text-[12px] text-rose-300">
                {error}
              </div>
            )}

            {missing.length > 0 && (
              <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200">
                <div className="font-medium">Campi obbligatori mancanti ({missing.length}):</div>
                <div className="mt-1 text-amber-200/80">{missing.join(", ")}</div>
                <div className="mt-1 text-[11px] text-amber-200/70">
                  Compila prima di inviare la pratica a Meta. Puoi editare i campi dal form lato cliente o usando l&apos;API admin.
                </div>
              </div>
            )}

            {/* Business data — toggle view/edit */}
            <section className="rounded-sm border border-slate-800 bg-brand-navy-deep p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-slate-100">Dati azienda</h3>
                {!editing ? (
                  <button
                    type="button"
                    onClick={handleEditStart}
                    className="rounded-pill border border-slate-700 px-3 py-1 text-[11px] font-medium text-slate-200 hover:bg-brand-navy-light"
                  >
                    Modifica
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleEditCancel}
                      disabled={savingEdit}
                      className="rounded-pill px-3 py-1 text-[11px] font-medium text-slate-300 hover:bg-brand-navy-light disabled:opacity-50"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      onClick={handleEditSave}
                      disabled={savingEdit}
                      className="rounded-pill bg-brand-teal px-3 py-1 text-[11px] font-semibold text-white hover:bg-brand-teal-dark disabled:opacity-50"
                    >
                      {savingEdit ? "Salvataggio..." : "Salva modifiche"}
                    </button>
                  </div>
                )}
              </div>

              {!editing ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                  <Field label="Nome commerciale" value={business.brand_name} />
                  <Field label="Ragione sociale" value={business.legal_name} />
                  <Field label="P.IVA" value={business.vat_number} />
                  <Field label="Cod. fiscale" value={business.tax_code} />
                  <Field
                    label="Indirizzo"
                    value={[business.address_line1, business.address_line2].filter(Boolean).join(", ") || null}
                  />
                  <Field label="Città" value={[business.postal_code, business.city, business.region].filter(Boolean).join(" ") || null} />
                  <Field label="Paese" value={business.country} />
                  <Field label="Categoria Meta" value={business.meta_category} />
                  <Field label="Telefono business" value={business.business_phone} />
                  <Field label="Email business" value={business.business_email} />
                  <Field label="Website" value={business.website_url} />
                </dl>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                  <EditField label="Nome commerciale" value={editDraft.brand_name ?? ""} onChange={(v) => setEditDraft({ ...editDraft, brand_name: v })} />
                  <EditField label="Ragione sociale" value={editDraft.legal_name ?? ""} onChange={(v) => setEditDraft({ ...editDraft, legal_name: v })} />
                  <EditField label="P.IVA" value={editDraft.vat_number ?? ""} onChange={(v) => setEditDraft({ ...editDraft, vat_number: v })} />
                  <EditField label="Cod. fiscale" value={editDraft.tax_code ?? ""} onChange={(v) => setEditDraft({ ...editDraft, tax_code: v })} />
                  <EditField label="Indirizzo" value={editDraft.address_line1 ?? ""} onChange={(v) => setEditDraft({ ...editDraft, address_line1: v })} />
                  <EditField label="Scala/piano" value={editDraft.address_line2 ?? ""} onChange={(v) => setEditDraft({ ...editDraft, address_line2: v })} />
                  <EditField label="Città" value={editDraft.city ?? ""} onChange={(v) => setEditDraft({ ...editDraft, city: v })} />
                  <EditField label="CAP" value={editDraft.postal_code ?? ""} onChange={(v) => setEditDraft({ ...editDraft, postal_code: v })} />
                  <EditField label="Provincia" value={editDraft.region ?? ""} onChange={(v) => setEditDraft({ ...editDraft, region: v })} />
                  <EditField label="Paese" value={editDraft.country ?? "IT"} onChange={(v) => setEditDraft({ ...editDraft, country: v })} />
                  <EditField label="Telefono business" value={editDraft.business_phone ?? ""} onChange={(v) => setEditDraft({ ...editDraft, business_phone: v })} placeholder="+39..." />
                  <EditField label="Email business" value={editDraft.business_email ?? ""} onChange={(v) => setEditDraft({ ...editDraft, business_email: v })} />
                  <EditField label="Website" value={editDraft.website_url ?? ""} onChange={(v) => setEditDraft({ ...editDraft, website_url: v })} />
                  <EditSelect
                    label="Categoria Meta"
                    value={editDraft.meta_category ?? ""}
                    onChange={(v) => setEditDraft({ ...editDraft, meta_category: v })}
                    options={META_CATEGORIES}
                  />
                </div>
              )}

              {/* Logo + upload */}
              <div className="mt-4 border-t border-slate-800 pt-3">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 overflow-hidden rounded-full border border-slate-700 bg-brand-navy-light">
                    {business.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveLogoSrc(business.logo_url) || ""}
                        alt="Logo"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">
                        Nessun logo
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-[11.5px] font-medium text-slate-200">Logo aziendale</div>
                    <div className="mt-0.5 text-[10.5px] text-slate-500">
                      PNG, JPG, WebP o SVG. Max 5 MB.
                    </div>
                    <label className="mt-2 inline-block cursor-pointer rounded-pill border border-slate-700 px-3 py-1 text-[11px] font-medium text-slate-200 hover:bg-brand-navy-light">
                      {uploadingLogo ? "Caricamento..." : business.logo_url ? "Sostituisci logo" : "Carica logo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(e) => handleLogoUpload(e.target.files)}
                        disabled={uploadingLogo}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* Meta application state machine */}
            {meta && (
              <section className="rounded-sm border border-slate-800 bg-brand-navy-deep p-4">
                <h3 className="text-[13px] font-semibold text-slate-100">Pratica Meta Business</h3>

                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                  <Field label="Subaccount Twilio SID" value={meta.twilio_subaccount_sid} mono />
                  <Field label="Numero Twilio" value={meta.twilio_phone_number} mono />
                  <Field label="WABA ID" value={meta.meta_waba_id} mono />
                  <Field label="Display name approvato" value={meta.meta_display_name_approved} />
                  <Field label="Inviata il" value={formatDateTime(meta.submitted_at)} />
                  <Field label="Approvata il" value={formatDateTime(meta.approved_at)} />
                  <Field label="Rifiutata il" value={formatDateTime(meta.rejected_at)} />
                  <Field label="Attivata il" value={formatDateTime(meta.activated_at)} />
                </div>

                {/* Twilio provisioning actions */}
                <div className="mt-5 rounded-sm border border-slate-800 bg-brand-navy-light p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[11.5px] font-medium text-slate-200">Provisioning Twilio</div>
                    <div className="text-[10px] text-slate-500">
                      Admin-only · ha costi reali
                    </div>
                  </div>

                  {provisionMsg && (
                    <div className="mt-2 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11.5px] text-emerald-200">
                      {provisionMsg}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!meta.twilio_subaccount_sid ? (
                      <button
                        type="button"
                        onClick={handleCreateSubaccount}
                        disabled={provisioning !== null}
                        className="rounded-pill bg-brand-teal px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
                      >
                        {provisioning === "subaccount" ? "Creazione..." : "1. Crea subaccount Twilio"}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 rounded-pill border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11.5px] text-emerald-300">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Subaccount creato
                      </div>
                    )}

                    {meta.twilio_subaccount_sid && !meta.twilio_phone_number ? (
                      <button
                        type="button"
                        onClick={handlePurchaseNumber}
                        disabled={provisioning !== null}
                        className="rounded-pill bg-brand-teal px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
                      >
                        {provisioning === "number" ? "Acquisto..." : "2. Acquista numero italiano (~€1/mese)"}
                      </button>
                    ) : meta.twilio_phone_number ? (
                      <div className="flex items-center gap-2 rounded-pill border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11.5px] text-emerald-300">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Numero: {meta.twilio_phone_number}
                      </div>
                    ) : null}
                  </div>

                  {meta.twilio_phone_number && !meta.meta_waba_id && (
                    <div className="mt-3 rounded-sm border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11.5px] text-amber-200">
                      <strong>Prossimo step manuale:</strong> apri Meta Business Manager e crea la richiesta WABA per
                      questo numero ({meta.twilio_phone_number}) con il brand e i dati aziendali.
                      Quando Meta approva, cambia stato a &quot;Approvata&quot; qui sotto e inserisci WABA ID + display name.
                    </div>
                  )}
                </div>

                {/* State change form */}
                <div className="mt-5 rounded-sm border border-slate-800 bg-brand-navy-light p-3">
                  <div className="text-[11.5px] font-medium text-slate-200">Cambia stato</div>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="flex flex-col text-[11px] text-slate-400">
                      Nuovo stato
                      <select
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value)}
                        aria-label="Nuovo stato pratica"
                        className="mt-1 rounded-sm border border-slate-700 bg-brand-navy-deep px-2.5 py-1.5 text-[12px] text-slate-100 focus:border-brand-teal focus:outline-none"
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={handleStatusChange}
                      disabled={savingStatus || newStatus === meta.status}
                      className="rounded-pill bg-brand-teal px-4 py-1.5 text-[12px] font-semibold text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
                    >
                      {savingStatus ? "Salvataggio..." : "Aggiorna stato"}
                    </button>
                  </div>

                  {/* Conditional fields based on selected target status */}
                  {newStatus === "rejected" && (
                    <div className="mt-3">
                      <label className="block text-[11px] text-slate-400">Motivo del rifiuto (visibile al cliente)</label>
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        rows={2}
                        placeholder="Es: Nome commerciale troppo generico, Meta richiede un brand riconoscibile"
                        aria-label="Motivo del rifiuto"
                        className="mt-1 w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-2.5 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
                      />
                    </div>
                  )}

                  {newStatus === "approved" && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className="flex flex-col text-[11px] text-slate-400">
                        WABA ID (da Meta Business Manager)
                        <input
                          type="text"
                          value={wabaId}
                          onChange={(e) => setWabaId(e.target.value)}
                          placeholder="123456789012345"
                          aria-label="WABA ID"
                          className="mt-1 rounded-sm border border-slate-700 bg-brand-navy-deep px-2.5 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-col text-[11px] text-slate-400">
                        Display name approvato
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Brand come appare su WhatsApp"
                          aria-label="Display name approvato"
                          className="mt-1 rounded-sm border border-slate-700 bg-brand-navy-deep px-2.5 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Admin notes */}
                <div className="mt-4">
                  <label className="block text-[11.5px] font-medium text-slate-200">
                    Note interne (solo staff)
                  </label>
                  <textarea
                    value={adminNotesDraft}
                    onChange={(e) => setAdminNotesDraft(e.target.value)}
                    rows={3}
                    placeholder="Es: cliente contattato il 10/04, mancano logo 1024×1024 e PIVA corretta"
                    aria-label="Note interne"
                    className="mt-1 w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[12px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10.5px] text-slate-500">
                      Le note non sono visibili al cliente. Utili per passaggi di consegna tra staff.
                    </span>
                    <button
                      type="button"
                      onClick={handleNotesSave}
                      disabled={savingNotes || adminNotesDraft === (meta.admin_notes ?? "")}
                      className="rounded-pill border border-slate-700 px-3 py-1 text-[11px] font-medium text-slate-200 hover:bg-brand-navy-light disabled:opacity-50"
                    >
                      {savingNotes ? "Salvataggio..." : "Salva note"}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Audit log */}
            {audit.length > 0 && (
              <section className="rounded-sm border border-slate-800 bg-brand-navy-deep p-4">
                <h3 className="text-[13px] font-semibold text-slate-100">Cronologia modifiche</h3>
                <ul className="mt-3 space-y-2">
                  {audit.slice(0, 15).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-start gap-3 border-b border-slate-800/60 pb-2 text-[11.5px] last:border-0"
                    >
                      <div className="w-32 shrink-0 text-slate-500">
                        {formatDateTime(entry.created_at)}
                      </div>
                      <div className="flex-1">
                        <div className="text-slate-200">
                          <span className="font-medium">{entry.actor_name || entry.actor_email || "—"}</span>{" "}
                          <span className="text-slate-400">{humanizeAction(entry.action)}</span>
                        </div>
                        {entry.changes && Object.keys(entry.changes).length > 0 && (
                          <div className="mt-0.5 text-[10.5px] text-slate-500">
                            {JSON.stringify(entry.changes)}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function humanizeAction(action: string): string {
  switch (action) {
    case "create_business":
      return "ha creato il profilo aziendale";
    case "update_business":
      return "ha aggiornato il profilo aziendale";
    case "meta_status_change":
      return "ha cambiato stato della pratica Meta";
    case "update_admin_notes":
      return "ha aggiornato le note interne";
    default:
      return action;
  }
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-slate-200 ${mono ? "font-mono text-[11.5px]" : "text-[12px]"}`}>
        {value || <span className="text-slate-500">—</span>}
      </dd>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-sm border border-slate-700 bg-brand-navy-light px-2.5 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
      />
    </label>
  );
}

function EditSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-wider text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="rounded-sm border border-slate-700 bg-brand-navy-light px-2.5 py-1.5 text-[12px] text-slate-100 focus:border-brand-teal focus:outline-none"
      >
        <option value="">— Seleziona —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
