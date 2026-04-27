import { ADVANCED_REASONING, OPERATION_CREDITS, formatCredits, type AIOperation } from "@/lib/ai-credits";

export function CreditBadge({
  operation,
  className,
}: {
  operation: AIOperation;
  className?: string;
}) {
  const credits = OPERATION_CREDITS[operation];
  const advanced = ADVANCED_REASONING.has(operation);
  const tooltip = advanced
    ? `${formatCredits(credits)} crediti — ragionamento avanzato`
    : `${formatCredits(credits)} crediti`;

  return (
    <span
      aria-hidden="true"
      title={tooltip}
      className={`inline-flex shrink-0 items-center gap-1 rounded-pill bg-brand-teal/15 px-1.5 py-0.5 text-[10px] font-medium text-brand-teal ${className ?? ""}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-2.5 w-2.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
      {formatCredits(credits)}
    </span>
  );
}
