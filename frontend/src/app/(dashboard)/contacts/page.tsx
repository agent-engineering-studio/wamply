"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

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
          <h1 className="text-[15px] font-semibold text-brand-ink">Contatti</h1>
          <p className="text-[11px] text-brand-ink-60">{total} contatti totali</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-sm border border-brand-ink-10 bg-white px-3 py-2 text-[12px] font-medium text-brand-ink-60 hover:bg-brand-ink-05">
            Importa CSV
          </button>
          <button className="rounded-sm bg-brand-green px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-green-dark">
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
          className="flex-1 rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-green focus:outline-none"
        />
      </div>

      <div className="mb-4 flex gap-1.5">
        <button onClick={() => { setTagFilter(null); setPage(1); }}
          className={`rounded-pill px-3 py-1 text-[11px] font-medium ${!tagFilter ? "bg-green-100 text-green-800" : "bg-brand-ink-10 text-brand-ink-60"}`}>
          Tutti
        </button>
        {allTags.slice(0, 6).map((tag) => (
          <button key={tag} onClick={() => { setTagFilter(tag); setPage(1); }}
            className={`rounded-pill px-3 py-1 text-[11px] font-medium ${tagFilter === tag ? "bg-green-100 text-green-800" : "bg-brand-ink-10 text-brand-ink-60"}`}>
            {tag}
          </button>
        ))}
      </div>

      {/* Contact List */}
      <div className="overflow-hidden rounded-card border border-brand-ink-10 bg-white shadow-card">
        {loading ? (
          <div className="p-8 text-center text-brand-ink-30 animate-pulse">Caricamento...</div>
        ) : (
          contacts.map((c) => {
            const initials = (c.name || c.phone).slice(0, 2).toUpperCase();
            const colors = ["bg-green-100 text-green-700", "bg-blue-100 text-blue-700", "bg-purple-100 text-purple-700", "bg-amber-100 text-amber-700"];
            const colorIdx = c.phone.charCodeAt(c.phone.length - 1) % colors.length;

            return (
              <div key={c.id} className="flex items-center gap-3 border-b border-brand-ink-10/50 px-4 py-2.5 last:border-0 hover:bg-brand-ink-05">
                <div className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${colors[colorIdx]}`}>
                  {initials}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-brand-ink">{c.name || "Senza nome"}</div>
                  <div className="font-mono text-[11px] text-brand-ink-60">{c.phone}</div>
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
          <div className="p-8 text-center text-[13px] text-brand-ink-30">Nessun contatto trovato</div>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            className="rounded-sm border border-brand-ink-10 px-3 py-1.5 text-[12px] disabled:opacity-40">
            ← Prec
          </button>
          <span className="text-[12px] text-brand-ink-60">Pagina {page} di {Math.ceil(total / 50)}</span>
          <button onClick={() => setPage(page + 1)} disabled={page >= Math.ceil(total / 50)}
            className="rounded-sm border border-brand-ink-10 px-3 py-1.5 text-[12px] disabled:opacity-40">
            Succ →
          </button>
        </div>
      )}
    </>
  );
}
