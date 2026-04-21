"use client";

import type { Pack } from "./CreditsClient";

// What you can do with N credits — estimates per operation from docs §6.4:
// personalize = 0.5c, chat = 1c, template generate/improve = 2-3c
function estimateUses(credits: number): { label: string; value: string }[] {
  return [
    { label: "Messaggi personalizzati", value: `~${Math.floor(credits / 0.5).toLocaleString("it-IT")}` },
    { label: "Template generati", value: `~${Math.floor(credits / 2).toLocaleString("it-IT")}` },
    { label: "Chat con agent AI", value: `~${Math.floor(credits / 1).toLocaleString("it-IT")}` },
  ];
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

function formatPerCredit(cents: number, credits: number): string {
  const perCredit = cents / 100 / credits;
  return perCredit.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

export function TopupPackGrid({
  packs,
  onBuy,
  loading,
}: {
  packs: Pack[];
  onBuy: (slug: string) => void;
  loading: string | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {packs.map((pack) => {
        const highlight = pack.badge === "Più venduto";
        const uses = estimateUses(pack.credits);
        const isLoading = loading === pack.slug;
        return (
          <div
            key={pack.slug}
            className={`flex flex-col rounded-card border p-5 transition-colors ${
              highlight
                ? "border-brand-teal/60 bg-brand-teal/5 shadow-teal"
                : "border-slate-800 bg-brand-navy-light"
            }`}
          >
            {pack.badge && (
              <div
                className={`mb-2 inline-block w-fit rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  highlight
                    ? "bg-brand-teal/20 text-brand-teal"
                    : "bg-amber-500/20 text-amber-300"
                }`}
              >
                {pack.badge}
              </div>
            )}

            <div className="text-[13px] font-medium text-slate-400">{pack.name}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[28px] font-bold text-slate-100">
                {formatPrice(pack.amount_cents)}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {formatPerCredit(pack.amount_cents, pack.credits)} / credito
            </div>

            <ul className="mt-4 mb-5 space-y-1 text-[11.5px] text-slate-300">
              {uses.map((u) => (
                <li key={u.label} className="flex items-start gap-1.5">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#0D9488"
                    strokeWidth="2.5"
                    className="mt-0.5 h-3 w-3 shrink-0"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>
                    <span className="text-slate-100 font-medium">{u.value}</span>{" "}
                    {u.label}
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => onBuy(pack.slug)}
              disabled={isLoading}
              className={`mt-auto w-full rounded-pill py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                highlight
                  ? "bg-brand-teal text-white shadow-teal hover:bg-brand-teal-dark"
                  : "border border-slate-700 text-slate-100 hover:bg-brand-navy-deep"
              }`}
            >
              {isLoading ? "Apertura pagamento..." : "Acquista"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
