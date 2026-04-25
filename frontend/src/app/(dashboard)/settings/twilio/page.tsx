import { TwilioIcon } from "@/components/shared/TwilioIcon";

export default function TwilioSettingsPage() {
  return (
    <>
      <div className="flex items-center gap-3">
        <TwilioIcon size={32} colored />
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Twilio WhatsApp</h1>
          <p className="mt-1 text-sm text-slate-400">
            Integrazione WhatsApp Business tramite Twilio Programmable Messaging.
          </p>
        </div>
      </div>
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-brand-teal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-medium text-slate-100">Configurazione gestita dall&apos;amministratore</p>
            <p className="mt-1 text-sm text-slate-400">
              Le credenziali Twilio (Account SID, Auth Token, numero mittente) sono configurate
              centralmente dall&apos;amministratore della piattaforma. Non è necessario inserirle qui —
              Wamply gestisce l&apos;infrastruttura WhatsApp per te.
            </p>
            <p className="mt-3 text-sm text-slate-400">
              Per problemi con l&apos;invio di messaggi o per richiedere un numero dedicato,
              contatta il supporto.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
