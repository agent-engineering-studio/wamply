interface Stats { total: number; sent: number; delivered: number; read: number; failed: number }
interface Props { stats: Stats }

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-[24px] font-bold text-slate-100">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function RateBar({ label, rate, color }: { label: string; rate: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="text-slate-400">{label}</span>
        <span className={`font-semibold ${color}`}>{rate}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${color === "text-brand-teal" ? "bg-brand-teal" : "bg-indigo-400"}`}
          style={{ width: `${rate}%` }}
        />
      </div>
    </div>
  );
}

export function CampaignAnalytics({ stats }: Props) {
  const deliveryRate = stats.sent > 0 ? Math.round((stats.delivered / stats.sent) * 100) : 0;
  const readRate = stats.delivered > 0 ? Math.round((stats.read / stats.delivered) * 100) : 0;
  const failRate = stats.sent > 0 ? Math.round((stats.failed / stats.sent) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Destinatari" value={String(stats.total)} sub="contatti target" />
        <StatCard label="Consegna" value={`${deliveryRate}%`} sub={`${stats.delivered} su ${stats.sent}`} />
        <StatCard label="Lettura" value={`${readRate}%`} sub={`${stats.read} letti`} />
        <StatCard label="Falliti" value={String(stats.failed)} sub={failRate > 0 ? `${failRate}% dei messaggi` : "nessuno"} />
      </div>
      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
        <h3 className="mb-4 text-[13.5px] font-semibold text-slate-100">Funnel di consegna</h3>
        <div className="space-y-3">
          <RateBar label="Tasso consegna" rate={deliveryRate} color="text-brand-teal" />
          <RateBar label="Tasso lettura" rate={readRate} color="text-indigo-400" />
        </div>
        <p className="mt-4 text-[11px] text-slate-500">
          I tassi vengono aggiornati man mano che Twilio notifica lo stato dei messaggi (webhook).
        </p>
      </div>
      {stats.failed > 0 && (
        <div className="rounded-sm border border-rose-500/20 bg-rose-500/10 p-4">
          <p className="text-[12.5px] text-rose-300">
            <strong>{stats.failed} messaggi non consegnati.</strong>{" "}
            I motivi più comuni sono: numero non registrato su WhatsApp, opt-out, o template non approvato.
          </p>
        </div>
      )}
    </div>
  );
}
