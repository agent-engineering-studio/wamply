import { BillingClient } from "./_components/BillingClient";

export default function BillingPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-100">Abbonamento</h1>
      <p className="mt-1 text-sm text-slate-300">
        Gestisci il tuo piano e il metodo di pagamento.
      </p>
      <div className="mt-6">
        <BillingClient />
      </div>
    </>
  );
}
