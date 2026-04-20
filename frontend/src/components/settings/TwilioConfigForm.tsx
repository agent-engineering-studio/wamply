"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { TwilioIcon } from "@/components/shared/TwilioIcon";

interface TwilioConfig {
  twilio_account_sid: string | null;
  twilio_from: string | null;
  twilio_messaging_service_sid: string | null;
  auth_token_set: boolean;
  business_name: string | null;
  default_language: string | null;
  verified: boolean;
}

interface ApiResponse {
  config: TwilioConfig | null;
}

export function TwilioConfigForm() {
  const [config, setConfig] = useState<TwilioConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  const [messagingServiceSid, setMessagingServiceSid] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("it");

  useEffect(() => {
    apiFetch("/settings/twilio")
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        const c = d.config;
        setConfig(c);
        setAccountSid(c?.twilio_account_sid ?? "");
        setFromNumber(c?.twilio_from ?? "");
        setMessagingServiceSid(c?.twilio_messaging_service_sid ?? "");
        setBusinessName(c?.business_name ?? "");
        setDefaultLanguage(c?.default_language ?? "it");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    if (!fromNumber && !messagingServiceSid) {
      setMessage({
        type: "error",
        text: "Inserisci almeno un numero WhatsApp (From) o un Messaging Service SID.",
      });
      setSaving(false);
      return;
    }

    const res = await apiFetch("/settings/twilio", {
      method: "POST",
      body: JSON.stringify({
        account_sid: accountSid,
        auth_token: authToken || undefined,
        from: fromNumber || undefined,
        messaging_service_sid: messagingServiceSid || undefined,
        business_name: businessName,
        default_language: defaultLanguage,
      }),
    });

    const result = await res.json();
    setSaving(false);

    if (result.success) {
      setMessage({ type: "success", text: "Configurazione Twilio salvata." });
      setAuthToken("");
    } else {
      setMessage({ type: "error", text: result.error ?? "Errore sconosciuto." });
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900 p-8 text-slate-500">
        Caricamento...
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-100"
    >
      <div className="flex items-center gap-3">
        <TwilioIcon size={28} colored />
        <div>
          <h2 className="text-lg font-semibold text-white">Twilio WhatsApp</h2>
          <p className="text-xs text-slate-400">
            Invio messaggi WhatsApp Business tramite Twilio Programmable Messaging.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20"
              : "bg-red-500/10 text-red-300 ring-1 ring-red-500/20"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            config?.verified ? "bg-emerald-400" : "bg-slate-600"
          }`}
        />
        <span className="text-sm text-slate-400">
          {config?.verified ? "Verificato" : "Non verificato"}
        </span>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">Account SID</label>
        <input
          type="text"
          value={accountSid}
          onChange={(e) => setAccountSid(e.target.value)}
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">
          Auth Token{" "}
          {config?.auth_token_set && (
            <span className="text-slate-500">(impostato)</span>
          )}
        </label>
        <input
          type="password"
          value={authToken}
          onChange={(e) => setAuthToken(e.target.value)}
          placeholder={config?.auth_token_set ? "Lascia vuoto per mantenere il token" : "Inserisci l'Auth Token"}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">
            From (numero WhatsApp)
          </label>
          <input
            type="text"
            value={fromNumber}
            onChange={(e) => setFromNumber(e.target.value)}
            placeholder="whatsapp:+14155238886"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
          <p className="mt-1 text-xs text-slate-500">
            Sandbox: <code>whatsapp:+14155238886</code>
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">
            Messaging Service SID
          </label>
          <input
            type="text"
            value={messagingServiceSid}
            onChange={(e) => setMessagingServiceSid(e.target.value)}
            placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
          <p className="mt-1 text-xs text-slate-500">Preferito in produzione (ha precedenza su From).</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Nome Business</label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="La Mia Azienda"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Lingua Predefinita</label>
          <select
            value={defaultLanguage}
            onChange={(e) => setDefaultLanguage(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          >
            <option value="it">Italiano</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="de">Deutsch</option>
            <option value="fr">Français</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
        <strong className="text-slate-300">Webhook URL</strong> — configura su Twilio Console → Phone Numbers
        → Messaging: <code className="ml-1 text-slate-300">https://&lt;tuo-dominio&gt;/api/webhooks/twilio</code>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-pill bg-brand-teal px-6 py-2.5 text-sm font-medium text-slate-950 hover:bg-brand-teal/90 disabled:opacity-50"
      >
        {saving ? "Salvataggio..." : "Salva Configurazione"}
      </button>
    </form>
  );
}
