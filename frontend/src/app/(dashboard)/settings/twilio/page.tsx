import { TwilioConfigForm } from "@/components/settings/TwilioConfigForm";
import { TwilioIcon } from "@/components/shared/TwilioIcon";

export default function TwilioSettingsPage() {
  return (
    <>
      <div className="flex items-center gap-3">
        <TwilioIcon size={32} colored />
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Twilio WhatsApp</h1>
          <p className="mt-1 text-sm text-slate-400">
            Configura le credenziali Twilio per inviare messaggi WhatsApp Business.
          </p>
        </div>
      </div>
      <div className="mt-6">
        <TwilioConfigForm />
      </div>
    </>
  );
}
