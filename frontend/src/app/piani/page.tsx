import Link from "next/link";
import { PLANS } from "@/lib/plans";
import { PlanCard } from "./PlanCard";
import { OverageCalculator } from "./OverageCalculator";

export const metadata = {
  title: "Piani e prezzi | Wamply",
  description:
    "Scegli il piano giusto per la tua attività. Da €19/mese, messaggi WhatsApp inclusi, fattura elettronica italiana. Prova 14 giorni gratis.",
};

export default function PianiPage() {
  return (
    <div className="min-h-screen bg-brand-navy-deep py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-10 text-center">
          <h1 className="text-[32px] font-bold text-slate-100">
            Piani pensati per la tua attività
          </h1>
          <p className="mt-2 text-[14px] text-slate-400">
            Canone flat + consumo reale dei messaggi. Niente sorprese. Fattura
            elettronica inclusa.
          </p>
        </div>

        <div className="mb-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <PlanCard key={plan.slug} plan={plan} />
          ))}
        </div>

        <div className="mb-10">
          <OverageCalculator />
        </div>

        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-6 text-center">
          <h2 className="text-[16px] font-semibold text-slate-100">
            Volumi superiori?
          </h2>
          <p className="mt-1 text-[12.5px] text-slate-400">
            Per oltre 20.000 messaggi al mese o esigenze personalizzate,
            costruiamo insieme il piano <strong>Enterprise</strong> con SLA
            dedicato.
          </p>
          <Link
            href="mailto:sales@wamply.it"
            className="mt-4 inline-block rounded-sm border border-brand-teal px-5 py-2 text-[13px] font-medium text-brand-teal hover:bg-brand-teal/10"
          >
            Parla con un consulente
          </Link>
        </div>
      </div>
    </div>
  );
}
