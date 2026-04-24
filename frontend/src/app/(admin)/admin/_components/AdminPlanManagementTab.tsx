interface AdminPlan {
  id: string;
  name: string;
  display_name: string | null;
  slug: string;
  price_cents: number;
  msg_included: number | null;
  overage_rates: { marketing: number; utility: number; free_form: number } | null;
  ai_features: Record<string, boolean> | null;
  active_segments: string[] | null;
}

export function AdminPlanManagementTab({ plans }: { plans: AdminPlan[] }) {
  return (
    <div className="space-y-4">
      <div className="text-[13px] font-semibold text-slate-100">
        Listino attivo ({plans.length} piani)
      </div>

      {plans.map((plan) => {
        const priceEur = (plan.price_cents / 100).toLocaleString("it-IT", {
          style: "currency",
          currency: "EUR",
        });
        const aiEnabled = Object.entries(plan.ai_features ?? {})
          .filter(([, v]) => v)
          .map(([k]) => k);
        const aiDisabled = Object.entries(plan.ai_features ?? {})
          .filter(([, v]) => !v)
          .map(([k]) => k);

        return (
          <div
            key={plan.id}
            className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="text-[15px] font-semibold text-slate-100">
                  {plan.display_name ?? plan.name}
                </span>
                <span className="ml-2 text-[11px] text-slate-500">
                  slug: {plan.slug}
                </span>
              </div>
              <span className="text-[20px] font-bold text-slate-100">
                {priceEur}/mese
              </span>
            </div>

            <div className="grid gap-3 text-[12px] sm:grid-cols-3">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Quota inclusa
                </div>
                <div className="text-slate-200">
                  {plan.msg_included != null && plan.msg_included > 0
                    ? `${plan.msg_included.toLocaleString("it-IT")} msg`
                    : "Solo consumo"}
                </div>
              </div>

              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Overage rates
                </div>
                {plan.overage_rates ? (
                  <div className="space-y-0.5 text-slate-200">
                    <div>Marketing: €{plan.overage_rates.marketing}/msg</div>
                    <div>Utility: €{plan.overage_rates.utility}/msg</div>
                    <div>Free-form: €{plan.overage_rates.free_form}/msg</div>
                  </div>
                ) : (
                  <div className="text-slate-500">—</div>
                )}
              </div>

              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  AI Features
                </div>
                <div className="space-y-0.5">
                  {aiEnabled.map((f) => (
                    <div key={f} className="text-emerald-400">
                      ✓ {f}
                    </div>
                  ))}
                  {aiDisabled.map((f) => (
                    <div key={f} className="text-slate-600 line-through">
                      · {f}
                    </div>
                  ))}
                  {aiEnabled.length === 0 && aiDisabled.length === 0 && (
                    <div className="text-slate-500">—</div>
                  )}
                </div>
              </div>
            </div>

            {plan.active_segments && plan.active_segments.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Segmenti target
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {plan.active_segments.map((s) => (
                    <span
                      key={s}
                      className="rounded-pill bg-brand-teal/10 px-2 py-0.5 text-[10.5px] text-brand-teal"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {plans.length === 0 && (
        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-8 text-center text-[12.5px] text-slate-500">
          Nessun piano attivo.
        </div>
      )}
    </div>
  );
}
