import type { Metadata } from "next";
import Link from "next/link";

import { SegmentsGrid } from "./_components/SegmentsGrid";

export const metadata: Metadata = {
  title:
    "Soluzioni Wamply per ogni settore | WhatsApp Business per le PMI italiane",
  description:
    "Scopri come Wamply aiuta parrucchieri, ristoranti, palestre, studi medici, avvocati e altri settori italiani a usare WhatsApp per fidelizzare i clienti.",
  alternates: { canonical: "https://wamply.it/soluzioni" },
};

export default function SoluzioniIndexPage() {
  return (
    <>
      <section className="border-b border-white/10 px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-[40px] font-semibold leading-tight text-white">
            Una soluzione{" "}
            <span className="text-brand-teal">per il tuo settore</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[16px] text-slate-300">
            Scegli il tuo mestiere e ti mostriamo come Wamply può aiutarti con
            esempi concreti, messaggi pronti e un piano suggerito.
          </p>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SegmentsGrid />
        </div>
      </section>

      <section className="border-t border-white/10 px-6 py-16 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-[24px] font-semibold text-white">
            Il tuo settore non è qui?
          </h2>
          <p className="mt-3 text-[14px] text-slate-300">
            Siamo in crescita: se hai un&apos;attività fuori da questi 11 casi,
            scrivici e creiamo una pagina dedicata al tuo mestiere.
          </p>
          <Link
            href="mailto:ciao@wamply.it?subject=Settore%20non%20in%20lista"
            className="mt-6 inline-block rounded-pill bg-brand-teal px-6 py-2.5 text-[14px] font-medium text-white hover:bg-brand-teal-dark transition-colors"
          >
            Contattaci
          </Link>
        </div>
      </section>
    </>
  );
}
