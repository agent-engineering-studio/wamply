"use client";

import { useMemo, useState } from "react";
import { PLANS } from "@/lib/plans";

type Category = "marketing" | "utility" | "free_form";

export function OverageCalculator() {
  const [planSlug, setPlanSlug] = useState("starter");
  const [msgCount, setMsgCount] = useState(500);
  const [category, setCategory] = useState<Category>("marketing");

  const plan = PLANS.find((p) => p.slug === planSlug)!;
  const { overageCount, overageCost, total } = useMemo(() => {
    const overage = Math.max(0, msgCount - plan.msgIncluded);
    const rate = plan.overageRates[category];
    const cost = Math.round(overage * rate * 100) / 100;
    return {
      overageCount: overage,
      overageCost: cost,
      total: plan.priceEur + cost,
    };
  }, [plan, msgCount, category]);

  return (
    <div className="rounded-card border border-slate-800 bg-brand-navy-light p-6">
      <h3 className="mb-4 text-[14px] font-semibold text-slate-100">
        Calcolatore costo mensile
      </h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="text-[11px] text-slate-400">Piano</span>
          <select
            aria-label="Piano"
            value={planSlug}
            onChange={(e) => setPlanSlug(e.target.value)}
            className="mt-1 w-full rounded-sm border border-slate-800 bg-brand-navy-deep px-2 py-1.5 text-[13px] text-slate-100"
          >
            {PLANS.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.displayName} (€{p.priceEur})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] text-slate-400">
            Messaggi/mese stimati
          </span>
          <input
            aria-label="Messaggi/mese stimati"
            type="number"
            min={0}
            value={msgCount}
            onChange={(e) =>
              setMsgCount(Math.max(0, Number(e.target.value) || 0))
            }
            className="mt-1 w-full rounded-sm border border-slate-800 bg-brand-navy-deep px-2 py-1.5 text-[13px] text-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-slate-400">Tipo prevalente</span>
          <select
            aria-label="Tipo prevalente"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="mt-1 w-full rounded-sm border border-slate-800 bg-brand-navy-deep px-2 py-1.5 text-[13px] text-slate-100"
          >
            <option value="marketing">Marketing (promozioni)</option>
            <option value="utility">Utility (promemoria, conferme)</option>
            <option value="free_form">Risposta entro 24h</option>
          </select>
        </label>
      </div>
      <div className="mt-4 rounded-sm border border-brand-teal/30 bg-brand-teal/5 p-3 text-[12.5px] text-slate-200">
        <div>
          Canone: <strong>€{plan.priceEur}</strong> · Inclusi:{" "}
          <strong>{plan.msgIncluded}</strong> msg
        </div>
        <div>
          Overage: <strong>{overageCount}</strong> msg × €
          {plan.overageRates[category]} = <strong>€{overageCost.toFixed(2)}</strong>
        </div>
        <div className="mt-2 text-[14px] font-semibold text-brand-teal">
          Totale stimato: €{total.toFixed(2)}/mese
        </div>
      </div>
    </div>
  );
}
