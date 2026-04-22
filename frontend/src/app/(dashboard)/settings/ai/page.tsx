import { AIConfigForm } from "@/components/settings/AIConfigForm";

export default function AISettingsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-100">Intelligenza Artificiale</h1>
      <p className="mt-1 text-sm text-slate-300">
        Attiva l&apos;AI con la tua chiave Claude personale (opzionale) e definisci tono
        e istruzioni per i messaggi generati.
      </p>
      <div className="mt-6">
        <AIConfigForm />
      </div>
    </>
  );
}
