"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { SmartTagsModal } from "./_components/SmartTagsModal";

interface Contact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: string[];
  opt_in: boolean;
  created_at: string;
}

const TAG_COLORS: Record<string, string> = {
  vip: "bg-purple-100 text-purple-800",
  newsletter: "bg-blue-100 text-blue-800",
  lead: "bg-amber-100 text-amber-800",
  premium: "bg-green-100 text-green-800",
  clienti: "bg-indigo-100 text-indigo-800",
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    if (tagFilter) params.set("tag", tagFilter);

    apiFetch(`/contacts?${params}`)
      .then((r) => r.json())
      .then((d) => { setContacts(d.contacts || []); setTotal(d.total || 0); })
      .finally(() => setLoading(false));
  }, [search, tagFilter, page]);

  const allTags = [...new Set(contacts.flatMap((c) => c.tags))];

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-100">Contatti</h1>
          <p className="text-[11px] text-slate-400">{total} contatti totali</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-sm border border-slate-800 bg-brand-navy-light px-3 py-2 text-[12px] font-medium text-slate-400 hover:bg-brand-navy-deep">
            Importa CSV
          </button>
          <button className="rounded-sm bg-brand-teal px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-teal-dark">
            + Aggiungi
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Cerca per nome, telefono, email..."
          className="flex-1 rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-brand-teal focus:outline-none"
        />
      </div>

      <div className="mb-4 flex gap-1.5">
        <button onClick={() => { setTagFilter(null); setPage(1); }}
          className={`rounded-pill px-3 py-1 text-[11px] font-medium ${!tagFilter ? "bg-green-100 text-green-800" : "bg-slate-800 text-slate-400"}`}>
          Tutti
        </button>
        {allTags.slice(0, 6).map((tag) => (
          <button key={tag} onClick={() => { setTagFilter(tag); setPage(1); }}
            className={`rounded-pill px-3 py-1 text-[11px] font-medium ${tagFilter === tag ? "bg-green-100 text-green-800" : "bg-slate-800 text-slate-400"}`}>
            {tag}
          </button>
        ))}
      </div>

      {/* Contact List */}
      <div className="overflow-hidden rounded-card border border-slate-800 bg-brand-navy-light shadow-card">
        {loading ? (
          <div className="p-8 text-center text-slate-500 animate-pulse">Caricamento...</div>
        ) : (
          contacts.map((c) => {
            const initials = (c.name || c.phone).slice(0, 2).toUpperCase();
            const colors = ["bg-green-100 text-green-700", "bg-blue-100 text-blue-700", "bg-purple-100 text-purple-700", "bg-amber-100 text-amber-700"];
            const colorIdx = c.phone.charCodeAt(c.phone.length - 1) % colors.length;

            return (
              <div key={c.id} className="flex items-center gap-3 border-b border-slate-800/50 px-4 py-2.5 last:border-0 hover:bg-brand-navy-deep">
                <div className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${colors[colorIdx]}`}>
                  {initials}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-slate-100">{c.name || "Senza nome"}</div>
                  <div className="font-mono text-[11px] text-slate-400">{c.phone}</div>
                </div>
                <div className="flex gap-1">
                  {c.tags.map((tag) => (
                    <span key={tag} className={`rounded-pill px-2 py-0.5 text-[10px] font-medium ${TAG_COLORS[tag] || "bg-gray-100 text-gray-600"}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
        {!loading && contacts.length === 0 && (
          <div className="p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal/15 text-brand-teal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </div>
            <h2 className="mb-1 text-[14px] font-semibold text-slate-100">
              {search || tagFilter ? "Nessun contatto corrisponde ai filtri" : "Nessun contatto"}
            </h2>
            <p className="mx-auto mb-5 max-w-sm text-[12px] text-slate-400">
              {search || tagFilter
                ? "Prova a modificare la ricerca o rimuovere i filtri."
                : "Importa la tua rubrica o aggiungi il primo contatto per iniziare a inviare campagne."}
            </p>
            {!search && !tagFilter && (
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  className="rounded-pill bg-brand-teal px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-teal-dark"
                >
                  Importa CSV
                </button>
                <button
                  type="button"
                  className="rounded-pill border border-slate-700 px-4 py-2 text-[12.5px] font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100"
                >
                  + Aggiungi manuale
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            className="rounded-sm border border-slate-800 px-3 py-1.5 text-[12px] disabled:opacity-40">
            ← Prec
          </button>
          <span className="text-[12px] text-slate-400">Pagina {page} di {Math.ceil(total / 50)}</span>
          <button type="button" onClick={() => setPage(page + 1)} disabled={page >= Math.ceil(total / 50)}
            className="rounded-sm border border-slate-800 px-3 py-1.5 text-[12px] disabled:opacity-40">
            Succ →
          </button>
        </div>
      )}
    </>
  );
}
