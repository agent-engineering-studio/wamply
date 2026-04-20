"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import {
  emptyForm,
  componentsToForm,
  formToComponents,
  type TemplateFormState,
} from "@/lib/templates/types";
import { validateTemplate } from "@/lib/templates/validation";
import { EditorForm } from "./_components/EditorForm";
import { PreviewBubble } from "./_components/PreviewBubble";

export default function TemplateEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === "new";

  const [form, setForm] = useState<TemplateFormState>(emptyForm());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    apiFetch(`/templates/${params.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Errore ${r.status}`);
        return r.json();
      })
      .then((t) => {
        if (cancelled) return;
        setForm({
          name: t.name,
          language: t.language,
          category: t.category,
          ...componentsToForm(t.components ?? []),
        });
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setServerError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, params.id]);

  async function handleSave() {
    const result = validateTemplate(form);
    setErrors(result.errors);
    if (!result.ok) return;

    setSaving(true);
    setServerError(null);
    try {
      const payload = {
        name: form.name,
        language: form.language,
        category: form.category,
        components: formToComponents(form),
        status: "approved",
      };
      const path = isNew ? "/templates" : `/templates/${params.id}`;
      const method = isNew ? "POST" : "PUT";
      const res = await apiFetch(path, { method, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Errore ${res.status}`);
      }
      router.push("/templates");
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Errore imprevisto.");
      setSaving(false);
    }
  }

  if (loading) return <div className="animate-pulse text-slate-500">Caricamento...</div>;

  return (
    <>
      <Link
        href="/templates"
        className="mb-4 inline-block text-[12px] text-brand-teal hover:underline"
      >
        ← Torna ai template
      </Link>

      <div className="mb-6">
        <h1 className="text-[18px] font-semibold text-slate-100">
          {isNew ? "Nuovo template" : "Modifica template"}
        </h1>
        <p className="mt-1 text-[11.5px] text-slate-400">
          Crea un messaggio riutilizzabile con variabili dinamiche.
        </p>
      </div>

      {serverError && (
        <div className="mb-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          {serverError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <EditorForm form={form} errors={errors} onChange={setForm} />
        </div>
        <div className="lg:col-span-2">
          <PreviewBubble form={form} />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
        <Link
          href="/templates"
          className="rounded-sm px-4 py-2 text-[13px] font-medium text-slate-400 hover:bg-brand-navy-deep"
        >
          Annulla
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-sm bg-brand-teal px-5 py-2 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(37,211,102,.3)] hover:bg-brand-teal-dark disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Salva template"}
        </button>
      </div>
    </>
  );
}
