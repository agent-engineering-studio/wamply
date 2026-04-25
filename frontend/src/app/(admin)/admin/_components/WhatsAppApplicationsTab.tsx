"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { BusinessDetailModal } from "./BusinessDetailModal";

export interface BusinessListItem {
  business_id: string;
  user_id: string;
  user_email: string;
  user_full_name: string | null;
  legal_name: string;
  brand_name: string;
  vat_number: string | null;
  logo_url: string | null;
  plan_name: string | null;
  plan_slug: string | null;
  subscription_status: string | null;
  application_id: string | null;
  status:
    | "draft"
    | "awaiting_docs"
    | "submitted_to_meta"
    | "in_review"
    | "approved"
    | "rejected"
    | "active"
    | "suspended"
    | null;
  twilio_phone_number: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  business_created_at: string;
  application_updated_at: string | null;
}

const STATUS_META: Record<
  NonNullable<BusinessListItem["status"]>,
  { label: string; className: string; dotClass: string }
> = {
  draft: {
    label: "In preparazione",
    className: "bg-slate-700/40 text-slate-300",
    dotClass: "bg-slate-400",
  },
  awaiting_docs: {
    label: "Attesa documenti",
    className: "bg-amber-500/15 text-amber-300",
    dotClass: "bg-amber-400",
  },
  submitted_to_meta: {
    label: "Inviata a Meta",
    className: "bg-blue-500/15 text-blue-300",
    dotClass: "bg-blue-400",
  },
  in_review: {
    label: "In revisione",
    className: "bg-blue-500/15 text-blue-300",
    dotClass: "bg-blue-400",
  },
  approved: {
    label: "Approvata",
    className: "bg-emerald-500/15 text-emerald-300",
    dotClass: "bg-emerald-400",
  },
  rejected: {
    label: "Rifiutata",
    className: "bg-rose-500/15 text-rose-300",
    dotClass: "bg-rose-400",
  },
  active: {
    label: "Attiva",
    className: "bg-emerald-500/20 text-emerald-200",
    dotClass: "bg-emerald-400",
  },
  suspended: {
    label: "Sospesa",
    className: "bg-rose-500/20 text-rose-200",
    dotClass: "bg-rose-400",
  },
};

const FILTER_TABS: Array<{
  key: "all" | "to_work" | NonNullable<BusinessListItem["status"]>;
  label: string;
}> = [
  { key: "all", label: "Tutte" },
  { key: "to_work", label: "Da lavorare" },
  { key: "draft", label: "In preparazione" },
  { key: "awaiting_docs", label: "Attesa docs" },
  { key: "submitted_to_meta", label: "Inviate" },
  { key: "in_review", label: "In revisione" },
  { key: "approved", label: "Approvate" },
  { key: "rejected", label: "Rifiutate" },
  { key: "active", label: "Attive" },
  { key: "suspended", label: "Sospese" },
];

// Rows in these states need human attention from the marketing partner
const TO_WORK_STATES = new Set([
  "draft",
  "awaiting_docs",
  "submitted_to_meta",
  "rejected",
]);

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86400000);
}

function resolveLogoSrc(logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  if (/^https?:\/\//.test(logoUrl)) return logoUrl;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:8100";
  return `${base}/api/v1${logoUrl}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export function WhatsAppApplicationsTab() {
  const [items, setItems] = useState<BusinessListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTER_TABS)[number]["key"]>("to_work");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false); // wired to CreateBusinessModal in Task 5

  function reload() {
    setLoading(true);
    apiFetch("/admin/businesses")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.businesses || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, to_work: 0 };
    for (const it of items) {
      if (!it.status) continue;
      c[it.status] = (c[it.status] ?? 0) + 1;
      if (TO_WORK_STATES.has(it.status)) c.to_work += 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "all") {
        // pass
      } else if (filter === "to_work") {
        if (!it.status || !TO_WORK_STATES.has(it.status)) return false;
      } else if (it.status !== filter) {
        return false;
      }
      if (!q) return true;
      const haystack = `${it.legal_name} ${it.brand_name} ${it.user_email} ${it.user_full_name ?? ""} ${it.vat_number ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, filter, query]);

  const toWork = counts.to_work ?? 0;
  const suspendedRejected = (counts.suspended ?? 0) + (counts.rejected ?? 0);

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Totale aziende", value: counts.all, color: "text-slate-100" },
          { label: "Da lavorare", value: toWork, color: toWork > 0 ? "text-amber-300" : "text-slate-100" },
          { label: "Approvate / Attive", value: (counts.approved ?? 0) + (counts.active ?? 0), color: "text-emerald-300" },
          { label: "Sospese / Rifiutate", value: suspendedRejected, color: suspendedRejected > 0 ? "text-rose-300" : "text-slate-100" },
        ].map((k) => (
          <div key={k.label} className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
            <div className={`text-[26px] font-semibold ${k.color}`}>{k.value}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-[10px] border border-slate-800 bg-brand-navy-light p-[3px]">
          {FILTER_TABS.map((t) => {
            const active = filter === t.key;
            const count = counts[t.key] ?? 0;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={`rounded-sm px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  active
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                {t.label} <span className="ml-0.5 text-slate-500">{count}</span>
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome, email, PIVA..."
          aria-label="Cerca pratiche"
          className="ml-auto w-72 rounded-sm border border-slate-800 bg-brand-navy-light px-3 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="animate-pulse rounded-card bg-brand-navy-light p-8 text-[12.5px] text-slate-500">
          Caricamento...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-10 text-center shadow-card">
          {items.length === 0 ? (
            // DB is empty — no businesses at all
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal/15 text-brand-teal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
                  <line x1="12" y1="12" x2="12" y2="16" />
                  <line x1="10" y1="14" x2="14" y2="14" />
                </svg>
              </div>
              <h2 className="mb-1 text-[14px] font-semibold text-slate-100">Nessuna pratica ancora</h2>
              <p className="mx-auto mb-5 max-w-xs text-[12px] text-slate-400">
                Quando un utente registra un&apos;azienda e avvia la richiesta WhatsApp Business, appare qui per la lavorazione.
                Puoi anche creare manualmente una pratica per conto di un cliente.
              </p>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-teal-dark"
              >
                + Crea prima pratica
              </button>
            </>
          ) : (
            // Items exist but filter/search returns nothing
            <>
              <h2 className="mb-1 text-[14px] font-semibold text-slate-100">Nessuna pratica corrisponde ai filtri</h2>
              <p className="text-[12px] text-slate-400">Modifica il filtro o la ricerca per trovare le pratiche.</p>
              <button
                type="button"
                onClick={() => { setFilter("all"); setQuery(""); }}
                className="mt-4 rounded-pill border border-slate-700 px-4 py-2 text-[12px] font-medium text-slate-300 hover:text-white"
              >
                Rimuovi filtri
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-slate-800 bg-brand-navy-light shadow-card">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-slate-800 bg-brand-navy-deep text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-3.5 py-2">Azienda</th>
                <th className="px-3.5 py-2">Cliente</th>
                <th className="px-3.5 py-2">Piano</th>
                <th className="px-3.5 py-2">Stato pratica</th>
                <th className="px-3.5 py-2">Numero WA</th>
                <th className="px-3.5 py-2">Ferma da</th>
                <th className="px-3.5 py-2">Registrata</th>
                <th className="px-3.5 py-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const meta = it.status ? STATUS_META[it.status] : null;
                const stuck = daysSince(it.application_updated_at);
                const stuckWarning = stuck !== null && stuck >= 7 && it.status && TO_WORK_STATES.has(it.status);
                return (
                  <tr
                    key={it.business_id}
                    className="border-b border-slate-800/50 align-top last:border-0 hover:bg-brand-navy-deep/60"
                  >
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        {it.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={resolveLogoSrc(it.logo_url) || ""}
                            alt=""
                            className="h-8 w-8 rounded-full border border-slate-700 object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-teal/15 text-[11px] font-semibold text-brand-teal">
                            {(it.brand_name || "??").slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-[13px] font-medium text-slate-100">{it.brand_name}</div>
                          <div className="text-[10.5px] text-slate-500">{it.legal_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="text-[12px] text-slate-200">{it.user_full_name || it.user_email}</div>
                      <div className="text-[10.5px] text-slate-500">{it.user_email}</div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="text-[12px] capitalize text-slate-100">{it.plan_name || "—"}</div>
                      <div className="text-[10.5px] text-slate-500">{it.subscription_status || "nessuno"}</div>
                    </td>
                    <td className="px-3.5 py-3">
                      {meta ? (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[10.5px] font-medium ${meta.className}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
                          {meta.label}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">Nessuna</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-[11.5px] text-slate-300">
                      {it.twilio_phone_number || "—"}
                    </td>
                    <td className="px-3.5 py-3 text-[11.5px]">
                      {stuck !== null ? (
                        <span className={stuckWarning ? "text-rose-300" : "text-slate-400"}>
                          {stuck}g
                          {stuckWarning && (
                            <span
                              className="ml-1 text-rose-400"
                              title="Pratica ferma da oltre 7 giorni"
                            >
                              ⚠
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-[11px] text-slate-400">
                      {formatDate(it.business_created_at)}
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedId(it.business_id)}
                        className="rounded-pill border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-brand-navy-deep hover:text-white"
                      >
                        Apri
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selectedId && (
        <BusinessDetailModal
          businessId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={() => {
            reload();
          }}
        />
      )}
    </div>
  );
}
