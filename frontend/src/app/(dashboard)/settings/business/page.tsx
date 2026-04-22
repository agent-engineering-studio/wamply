import { BusinessProfileForm } from "./_components/BusinessProfileForm";

export default function BusinessSettingsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-100">Dati aziendali</h1>
      <p className="mt-1 text-sm text-slate-300">
        Compila i dati della tua azienda per attivare WhatsApp Business ufficiale.
        Puoi anche inviarceli via email: ci penseremo noi a compilare al posto tuo.
      </p>
      <div className="mt-6">
        <BusinessProfileForm />
      </div>
    </>
  );
}
