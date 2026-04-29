import { Suspense } from "react";
import { BillingClient } from "./_components/BillingClient";

export default function BillingPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-100">Abbonamento</h1>
      <p className="mt-1 text-sm text-slate-300">
        Gestisci il tuo piano e il metodo di pagamento.
      </p>
      <div className="mt-6">
        {/* Suspense required because BillingClient calls useSearchParams. */}
        <Suspense fallback={<div className="animate-pulse text-slate-400">Caricamento...</div>}>
          <BillingClient />
        </Suspense>
      </div>
    </>
  );
}
