"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

  useEffect(() => {
    fetch("/api/templates").then((r) => r.json()).then((d) => setTemplates(d.templates || []));
    // Groups API doesn't exist yet — will be empty
    fetch("/api/contacts?page=1").then(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, template_id: templateId || null, group_id: groupId || null }),
    });
    const campaign = await res.json();

    if (sendNow && campaign.id) {
      await fetch(`/api/campaigns/${campaign.id}/launch`, { method: "POST" });
    }

    router.push(`/campaigns/${campaign.id}`);
  }

  return (
    <>
      <h1 className="mb-1 text-[15px] font-semibold text-brand-ink">Nuovo invio</h1>
      <p className="mb-6 text-[11px] text-brand-ink-60">Crea e invia una campagna WhatsApp</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-card border border-brand-ink-10 bg-white p-5 shadow-card">
          <div className="mb-4">
            <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">Nome campagna</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Es: Promo Estiva 2026" required
              className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-green focus:outline-none" />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">Template</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-green focus:outline-none">
              <option value="">Seleziona template...</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-[11.5px] font-medium text-brand-ink-60">Invio</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSendNow(true)}
                className={`rounded-[10px] border-[1.5px] p-3 text-center text-[12.5px] font-medium ${sendNow ? "border-brand-green bg-brand-green-pale text-brand-green-dark" : "border-brand-ink-10 text-brand-ink-60"}`}>
                Immediato
              </button>
              <button type="button" onClick={() => setSendNow(false)}
                className={`rounded-[10px] border-[1.5px] p-3 text-center text-[12.5px] font-medium ${!sendNow ? "border-brand-green bg-brand-green-pale text-brand-green-dark" : "border-brand-ink-10 text-brand-ink-60"}`}>
                Schedulato
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-card border border-brand-green/25 bg-brand-green-pale p-4">
          <div className="text-[12px] font-medium text-brand-green-dark">🤖 Agent AI attivo</div>
          <div className="mt-1 text-[11px] text-brand-ink-60">
            Claude personalizzerà ogni messaggio per ciascun destinatario.
          </div>
        </div>

        <button type="submit" disabled={saving || !name}
          className="w-full rounded-sm bg-brand-green py-3 text-[14px] font-medium text-white shadow-[0_2px_8px_rgba(37,211,102,.3)] hover:bg-brand-green-dark disabled:opacity-50">
          {saving ? "Creazione..." : sendNow ? "Crea e invia subito" : "Crea campagna"}
        </button>
      </form>
    </>
  );
}
