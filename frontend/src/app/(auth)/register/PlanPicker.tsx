import { PLANS } from "@/lib/plans";
import Link from "next/link";

export function PlanPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {PLANS.map((p) => (
        <button
          key={p.slug}
          type="button"
          onClick={() => onSelect(p.slug)}
          className={`rounded-sm border p-3 text-left transition-colors ${
            selected === p.slug
              ? "border-brand-teal bg-brand-teal/10"
              : "border-brand-ink-10 hover:border-brand-teal/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-brand-ink">
              {p.displayName}
            </span>
            <span className="text-[12px] text-brand-ink-60">
              €{p.priceEur}/mese
            </span>
          </div>
          <div className="text-[11px] text-brand-ink-60">{p.target}</div>
        </button>
      ))}
      <Link
        href="/piani"
        className="text-[11px] text-brand-teal-dark underline"
      >
        Confronta tutti i piani →
      </Link>
    </div>
  );
}
