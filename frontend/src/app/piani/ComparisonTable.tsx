import {
  PLANS,
  FEATURE_LABELS,
  PLATFORM_FEATURE_LABELS,
  formatLimit,
  type PlanTier,
} from "@/lib/plans";

function Cell({ value }: { value: string | number | boolean }) {
  if (typeof value === "boolean") {
    return (
      <span
        className={
          value
            ? "text-brand-teal font-semibold"
            : "text-slate-600"
        }
        aria-label={value ? "Incluso" : "Non incluso"}
      >
        {value ? "✓" : "—"}
      </span>
    );
  }
  return <span className="text-slate-200">{value}</span>;
}

function HeaderCell({ plan }: { plan: PlanTier }) {
  return (
    <th
      scope="col"
      className={`px-3 py-4 text-center align-bottom ${
        plan.highlighted ? "bg-brand-teal/10" : ""
      }`}
    >
      <div className="text-[13px] font-semibold text-slate-100">
        {plan.displayName}
      </div>
      <div className="mt-1 text-[18px] font-bold text-slate-100">
        €{plan.priceEur}
        <span className="text-[11px] font-normal text-slate-400">/mese</span>
      </div>
    </th>
  );
}

function SectionRow({ label }: { label: string }) {
  return (
    <tr className="border-t border-slate-800 bg-brand-navy-deep/40">
      <th
        scope="row"
        colSpan={PLANS.length + 1}
        className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"
      >
        {label}
      </th>
    </tr>
  );
}

function Row({
  label,
  values,
  hint,
}: {
  label: string;
  values: Array<string | number | boolean>;
  hint?: string;
}) {
  return (
    <tr className="border-t border-slate-800/60">
      <th
        scope="row"
        className="px-3 py-2.5 text-left text-[12.5px] font-normal text-slate-300"
      >
        {label}
        {hint && (
          <span className="block text-[10.5px] text-slate-500">{hint}</span>
        )}
      </th>
      {values.map((v, i) => (
        <td
          key={i}
          className={`px-3 py-2.5 text-center text-[12.5px] ${
            PLANS[i].highlighted ? "bg-brand-teal/6" : ""
          }`}
        >
          <Cell value={v} />
        </td>
      ))}
    </tr>
  );
}

export function ComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-card border border-slate-800 bg-brand-navy-light">
      <table className="w-full min-w-180 border-collapse">
        <thead>
          <tr>
            <th scope="col" className="w-[28%] px-3 py-4 text-left">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
                Confronto piani
              </div>
            </th>
            {PLANS.map((p) => (
              <HeaderCell key={p.slug} plan={p} />
            ))}
          </tr>
        </thead>

        <tbody>
          <SectionRow label="Volumi & limiti" />
          <Row
            label="Messaggi inclusi nel canone"
            hint="Oltre la soglia: tariffa overage"
            values={PLANS.map((p) =>
              p.msgIncluded === 0
                ? "Solo a consumo"
                : p.msgIncluded.toLocaleString("it-IT"),
            )}
          />
          <Row
            label="Campagne / mese"
            values={PLANS.map((p) =>
              formatLimit(p.limits.campaignsMonth, ""),
            )}
          />
          <Row
            label="Contatti max"
            values={PLANS.map((p) => formatLimit(p.limits.contacts, ""))}
          />
          <Row
            label="Template max"
            values={PLANS.map((p) => formatLimit(p.limits.templates, ""))}
          />
          <Row
            label="Membri team"
            values={PLANS.map((p) => formatLimit(p.limits.teamMembers, ""))}
          />
          <Row
            label="AI Credits / mese"
            hint="Crediti per generazione & traduzione"
            values={PLANS.map((p) =>
              p.limits.aiCreditsMonth === 0
                ? "—"
                : p.limits.aiCreditsMonth.toLocaleString("it-IT"),
            )}
          />

          <SectionRow label="Tariffe overage (€/messaggio)" />
          <Row
            label="Marketing"
            values={PLANS.map(
              (p) => `€${p.overageRates.marketing.toFixed(2)}`,
            )}
          />
          <Row
            label="Utility"
            values={PLANS.map(
              (p) => `€${p.overageRates.utility.toFixed(3)}`,
            )}
          />
          <Row
            label="Free-form (24h)"
            values={PLANS.map(
              (p) => `€${p.overageRates.free_form.toFixed(2)}`,
            )}
          />

          <SectionRow label="Funzionalità AI" />
          {(
            Object.keys(FEATURE_LABELS) as Array<keyof typeof FEATURE_LABELS>
          ).map((key) => (
            <Row
              key={key}
              label={FEATURE_LABELS[key]}
              values={PLANS.map((p) => p.aiFeatures[key])}
            />
          ))}

          <SectionRow label="Funzionalità di piattaforma" />
          {(
            Object.keys(PLATFORM_FEATURE_LABELS) as Array<
              keyof typeof PLATFORM_FEATURE_LABELS
            >
          ).map((key) => (
            <Row
              key={key}
              label={PLATFORM_FEATURE_LABELS[key]}
              values={PLANS.map((p) => p.platformFeatures[key])}
            />
          ))}
          <Row
            label="Onboarding 1:1 in italiano"
            values={PLANS.map((p) => p.onboarding)}
          />
          <Row
            label="Trial 14 giorni gratis"
            values={PLANS.map(() => true)}
          />
          <Row
            label="Fattura elettronica (SDI)"
            values={PLANS.map(() => true)}
          />
        </tbody>
      </table>
    </div>
  );
}
