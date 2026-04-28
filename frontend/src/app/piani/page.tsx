import Link from "next/link";
import { PLANS } from "@/lib/plans";
import { SegmentsCarousel } from "@/components/segments/SegmentsCarousel";
import { PlanCard } from "./PlanCard";
import { OverageCalculator } from "./OverageCalculator";
import { ComparisonTable } from "./ComparisonTable";
import { FAQ } from "./FAQ";

export const metadata = {
  title: "Piani e prezzi | Wamply",
  description:
    "Scegli il piano giusto per la tua attività. Da €19/mese, messaggi WhatsApp inclusi, fattura elettronica italiana. Prova 14 giorni gratis.",
};

export default function PianiPage() {
  return (
    <div className="min-h-screen bg-brand-navy-deep">
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="border-b border-slate-800/60 py-16">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <span className="inline-block rounded-pill bg-brand-teal/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-teal">
            Listino β+ v2 · IVA esclusa
          </span>
          <h1 className="mt-4 text-[36px] font-bold leading-tight text-slate-100 md:text-[44px]">
            Piani pensati per la tua attività
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-400">
            Canone flat + consumo reale dei messaggi. Niente sorprese,
            niente vincoli. Setup chiavi in mano del tuo numero WhatsApp
            Business e fattura elettronica italiana inclusa.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-slate-500">
            <span className="flex items-center gap-2">
              <span className="text-brand-teal">✓</span> 14 giorni gratis
            </span>
            <span className="flex items-center gap-2">
              <span className="text-brand-teal">✓</span> Senza carta di credito
            </span>
            <span className="flex items-center gap-2">
              <span className="text-brand-teal">✓</span> Fattura elettronica SDI
            </span>
            <span className="flex items-center gap-2">
              <span className="text-brand-teal">✓</span> Disdici quando vuoi
            </span>
          </div>
        </div>
      </section>

      {/* ── Plan cards ─────────────────────────────────────── */}
      <section className="py-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => (
              <PlanCard key={plan.slug} plan={plan} />
            ))}
          </div>
          <p className="mt-4 text-center text-[11.5px] text-slate-500">
            Tutti i prezzi sono mensili, IVA esclusa. Il piano Avvio è a
            consumo puro: paghi solo i messaggi che invii.
          </p>
        </div>
      </section>

      {/* ── Comparison table ──────────────────────────────── */}
      <section className="border-t border-slate-800/60 py-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-8 text-center">
            <h2 className="text-[24px] font-bold text-slate-100">
              Confronta tutti i piani
            </h2>
            <p className="mt-2 text-[13px] text-slate-400">
              Tutte le funzionalità a colpo d'occhio. Cambi piano in
              qualsiasi momento.
            </p>
          </div>
          <ComparisonTable />
        </div>
      </section>

      {/* ── Overage calculator ────────────────────────────── */}
      <section className="border-t border-slate-800/60 py-14">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-8 text-center">
            <h2 className="text-[24px] font-bold text-slate-100">
              Calcola il tuo costo reale
            </h2>
            <p className="mt-2 text-[13px] text-slate-400">
              Stima il costo mensile in base ai messaggi che pensi di
              inviare. Nessuna sorpresa in fattura.
            </p>
          </div>
          <OverageCalculator />
        </div>
      </section>

      {/* ── Segments — carousel con immagine per settore ───── */}
      <section className="border-t border-slate-800/60 py-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-8 text-center">
            <h2 className="text-[24px] font-bold text-slate-100">
              Pensato per la tua categoria
            </h2>
            <p className="mt-2 text-[13px] text-slate-400">
              Template, automazioni e best practice già pronte per il
              tuo settore. Tutti i piani li includono.
            </p>
          </div>
          <SegmentsCarousel />
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────── */}
      <section className="border-t border-slate-800/60 py-12">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-4">
          {[
            {
              t: "Setup chiavi in mano",
              d: "Ci occupiamo noi di Twilio, WABA e verifica Meta.",
            },
            {
              t: "Fattura elettronica IT",
              d: "Emessa via SDI con codice destinatario o PEC.",
            },
            {
              t: "Supporto in italiano",
              d: "Email e chat. Risposte entro 1 giorno lavorativo.",
            },
            {
              t: "Nessun vincolo",
              d: "Disdici dal pannello in autonomia, in qualsiasi momento.",
            },
          ].map(({ t, d }) => (
            <div key={t} className="text-center md:text-left">
              <div className="text-[13px] font-semibold text-slate-100">
                {t}
              </div>
              <div className="mt-1 text-[12px] text-slate-400">{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────── */}
      <section className="border-t border-slate-800/60 py-14">
        <div className="mx-auto max-w-3xl px-6">
          <div className="mb-8 text-center">
            <h2 className="text-[24px] font-bold text-slate-100">
              Domande frequenti
            </h2>
            <p className="mt-2 text-[13px] text-slate-400">
              Le risposte alle domande che ci fanno più spesso.
            </p>
          </div>
          <FAQ />
        </div>
      </section>

      {/* ── CTA finale ────────────────────────────────────── */}
      <section className="border-t border-slate-800/60 py-14">
        <div className="mx-auto max-w-4xl px-6">
          <div className="rounded-card border border-brand-teal/40 bg-linear-to-br from-brand-navy-light to-brand-navy-deep p-8 text-center">
            <h2 className="text-[22px] font-bold text-slate-100">
              Volumi superiori o esigenze custom?
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-[13px] text-slate-400">
              Per oltre 20.000 messaggi al mese, multi-brand, integrazioni
              su misura o SLA dedicato, costruiamo insieme un piano{" "}
              <strong className="text-slate-200">Enterprise</strong> con
              account manager dedicato.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="mailto:sales@wamply.it"
                className="rounded-sm bg-brand-teal px-6 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-teal-dark"
              >
                Parla con un consulente
              </Link>
              <Link
                href="/signup"
                className="rounded-sm border border-slate-700 px-6 py-2.5 text-[13px] font-medium text-slate-100 transition-colors hover:bg-brand-navy-light"
              >
                Inizia il trial gratuito
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
