"use client";

import { useEffect, useState } from "react";

interface WhatsAppData {
  phone_number_id: string | null;
  waba_id: string | null;
  token_set: boolean;
  token_masked: string | null;
  webhook_verify_token: string | null;
  business_name: string | null;
  default_language: string;
  verified: boolean;
}

export function WhatsAppConfigForm() {
  const [data, setData] = useState<WhatsAppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [token, setToken] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("it");

  useEffect(() => {
    fetch("/api/settings/whatsapp")
      .then((r) => r.json())
      .then((d: WhatsAppData) => {
        setData(d);
        setPhoneNumberId(d.phone_number_id ?? "");
        setWabaId(d.waba_id ?? "");
        setBusinessName(d.business_name ?? "");
        setDefaultLanguage(d.default_language ?? "it");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/settings/whatsapp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        token: token || undefined,
        business_name: businessName,
        default_language: defaultLanguage,
      }),
    });

    const result = await res.json();
    setSaving(false);

    if (result.success) {
      setMessage({
        type: result.warning ? "error" : "success",
        text: result.warning ?? "Configurazione WhatsApp salvata con successo.",
      });
      setToken("");
    } else {
      setMessage({ type: "error", text: result.error ?? "Errore sconosciuto." });
    }
  }

  if (loading) {
    return <div className="animate-pulse rounded-xl bg-white p-8 text-slate-400">Caricamento...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6">
      {message && (
        <div className={`rounded-lg p-3 text-sm ${
          message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${data?.verified ? "bg-green-500" : "bg-slate-300"}`} />
        <span className="text-sm text-slate-600">
          {data?.verified ? "Verificato" : "Non verificato"}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Phone Number ID</label>
          <input
            type="text"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="123456789012345"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">WABA ID</label>
          <input
            type="text"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="100200300400500"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            required
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Access Token {data?.token_set && <span className="text-slate-400">(impostato: {data.token_masked})</span>}
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={data?.token_set ? "Lascia vuoto per mantenere il token attuale" : "Inserisci il token"}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nome Business</label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="La Mia Azienda"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Lingua Predefinita</label>
          <select
            value={defaultLanguage}
            onChange={(e) => setDefaultLanguage(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          >
            <option value="it">Italiano</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="de">Deutsch</option>
            <option value="fr">Français</option>
          </select>
        </div>
      </div>

      {data?.webhook_verify_token && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Webhook Verify Token</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
              {data.webhook_verify_token}
            </code>
          </div>
          <p className="mt-1 text-xs text-slate-400">Usa questo token nella configurazione webhook di Meta.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-pill bg-brand-teal px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-teal/90 disabled:opacity-50"
      >
        {saving ? "Salvataggio..." : "Salva Configurazione"}
      </button>
    </form>
  );
}
