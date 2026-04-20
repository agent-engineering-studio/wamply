"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { TemplatePreview } from "./_components/TemplatePreview";

interface Template { id: string; name: string; category: string; }
interface Group { id: string; name: string; }

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [sendNow, setSendNow] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/templates").then((r) => r.json()).then((d) => setTemplates(d.templates || []));
    // Groups API doesn't exist yet — will be empty
    apiFetch("/contacts?page=1").then(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await apiFetch("/campaigns", {
        method: "POST",
        body: JSON.stringify({ name, template_id: templateId || null, group_id: groupId || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Errore ${res.status} nella creazione della campagna.`);
      }
      const campaign = await res.json();
      if (!campaign?.id) throw new Error("Risposta del server senza id campagna.");

      if (sendNow) {
        await apiFetch(`/campaigns/${campaign.id}/launch`, { method: "POST" });
      }
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto.");
      setSaving(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-[15px] font-semibold text-slate-100">Nuovo invio</h1>
      <p className="mb-6 text-[11px] text-slate-400">Crea e invia una campagna WhatsApp</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <form onSubmit={handleSubmit} className="space-y-5 lg:col-span-3">
        {error && (
          <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
            {error}
          </div>
        )}
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
          <div className="mb-4">
            <label className="mb-1 block text-[11.5px] font-medium text-slate-400">Nome campagna</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Es: Promo Estiva 2026" required
              className="w-full rounded-sm border border-slate-800 px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none" />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-[11.5px] font-medium text-slate-400">Template</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
              disabled={templates.length === 0}
              className="w-full rounded-sm border border-slate-800 px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none disabled:bg-brand-navy-deep disabled:text-slate-400">
              <option value="">
                {templates.length === 0 ? "Nessun template disponibile" : "Seleziona template..."}
              </option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
            </select>
            {templates.length === 0 && (
              <p className="mt-1 text-[11px] text-slate-400">
                Non hai ancora template.{" "}
                <Link href="/templates/new" className="font-medium text-brand-teal hover:underline">
                  Creane uno
                </Link>{" "}
                per inviare campagne personalizzate.
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-[11.5px] font-medium text-slate-400">Invio</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSendNow(true)}
                className={`rounded-[10px] border-[1.5px] p-3 text-center text-[12.5px] font-medium ${sendNow ? "border-brand-teal bg-brand-navy-light text-brand-teal" : "border-slate-800 text-slate-400"}`}>
                Immediato
              </button>
              <button type="button" onClick={() => setSendNow(false)}
                className={`rounded-[10px] border-[1.5px] p-3 text-center text-[12.5px] font-medium ${!sendNow ? "border-brand-teal bg-brand-navy-light text-brand-teal" : "border-slate-800 text-slate-400"}`}>
                Schedulato
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-card border border-brand-teal/25 bg-brand-navy-light p-4">
          <div className="text-[12px] font-medium text-brand-teal">🤖 Agent AI attivo</div>
          <div className="mt-1 text-[11px] text-slate-400">
            Claude personalizzerà ogni messaggio per ciascun destinatario.
          </div>
        </div>

        <button type="submit" disabled={saving || !name}
          className="w-full rounded-sm bg-brand-teal py-3 text-[14px] font-medium text-white shadow-[0_2px_8px_rgba(37,211,102,.3)] hover:bg-brand-teal-dark disabled:opacity-50">
          {saving ? "Creazione..." : sendNow ? "Crea e invia subito" : "Crea campagna"}
        </button>
      </form>

        <aside className="lg:col-span-2">
          <TemplatePreview templateId={templateId || null} />
        </aside>
      </div>
    </>
  );
}
