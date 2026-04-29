import { Suspense } from "react";
import { CreditsClient } from "./_components/CreditsClient";

export default function CreditsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-100">Crediti AI</h1>
      <p className="mt-1 text-sm text-slate-300">
        Gestisci il tuo saldo crediti AI e ricarica quando servono operazioni in più.
      </p>
      <div className="mt-6">
        {/* Suspense required because CreditsClient calls useSearchParams. */}
        <Suspense fallback={<div className="animate-pulse text-slate-400">Caricamento...</div>}>
          <CreditsClient />
        </Suspense>
      </div>
    </>
  );
}
