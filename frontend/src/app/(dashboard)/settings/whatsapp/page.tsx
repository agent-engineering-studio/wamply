import { WhatsAppConfigForm } from "@/components/settings/WhatsAppConfigForm";

export default function WhatsAppSettingsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">WhatsApp Business</h1>
      <p className="mt-1 text-sm text-slate-500">
        Configura il collegamento con la Meta Cloud API per inviare messaggi.
      </p>
      <div className="mt-6">
        <WhatsAppConfigForm />
      </div>
    </>
  );
}
