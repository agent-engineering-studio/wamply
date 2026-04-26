interface Stats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export function SendProgress({ stats }: { stats: Stats }) {
  const { total, sent, delivered, read, failed } = stats;
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  const deliveryPct = sent > 0 ? Math.round((delivered / sent) * 100) : 0;
  const readPct = delivered > 0 ? Math.round((read / delivered) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-medium text-white">Invio in corso…</span>
        <span className="text-slate-400">
          {sent} / {total} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className="h-full rounded-full bg-brand-teal transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-4 text-[12px] text-slate-400">
        <span>Consegnati: {deliveryPct}%</span>
        <span>Letti: {readPct}%</span>
        {failed > 0 && <span className="text-red-400">{failed} falliti</span>}
      </div>
    </div>
  );
}
