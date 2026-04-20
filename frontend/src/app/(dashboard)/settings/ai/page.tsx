import { AIConfigForm } from "@/components/settings/AIConfigForm";

export default function AISettingsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-100">Intelligenza Artificiale</h1>
      <p className="mt-1 text-sm text-slate-500">
        Configura il modello AI e la modalità di accesso.
      </p>
      <div className="mt-6">
        <AIConfigForm />
      </div>
    </>
  );
}
