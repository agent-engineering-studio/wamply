"use client";

import type { PasswordScore } from "@/lib/password-strength";

const LABELS = ["Molto debole", "Debole", "Accettabile", "Buona", "Eccellente"] as const;
const BAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-600",
] as const;

export function PasswordStrengthMeter({
  password,
  score,
}: {
  password: string;
  score: PasswordScore | null;
}) {
  if (password.length === 0) return null;

  const s = score?.score ?? 0;
  const label = LABELS[s];
  const warning = score?.warning ?? "";
  const suggestions = score?.suggestions ?? [];

  return (
    <div role="status" aria-live="polite" className="mt-2">
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label={`Robustezza password: ${label}`}
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={s}
          className="flex flex-1 gap-1"
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                s >= i ? BAR_COLORS[s] : "bg-brand-ink-10"
              }`}
            />
          ))}
        </div>
        <span className="text-[11px] font-medium text-brand-ink-60">{label}</span>
      </div>

      {warning && (
        <p className="mt-1 text-[11px] text-red-600">{warning}</p>
      )}
      {suggestions.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {suggestions.slice(0, 2).map((tip, i) => (
            <li key={i} className="text-[11px] text-brand-ink-60">
              · {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
