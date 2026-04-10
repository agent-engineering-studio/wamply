"use client";

export default function GroupsPage() {
  const groups = [
    { id: "1", name: "Clienti VIP", description: "I clienti con spesa superiore a 500€", count: 124, color: "bg-purple-50", stroke: "#5B21B6" },
    { id: "2", name: "Newsletter", description: "Iscritti alla newsletter mensile", count: 890, color: "bg-blue-50", stroke: "#1565C0" },
    { id: "3", name: "Lead freddi", description: "Contatti da riattivare", count: 340, color: "bg-amber-50", stroke: "#92400E" },
    { id: "4", name: "Rivenditori", description: "Partner e rivenditori autorizzati", count: 45, color: "bg-green-50", stroke: "#128C7E" },
  ];

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-brand-ink">Gruppi</h1>
          <p className="text-[11px] text-brand-ink-60">{groups.length} gruppi</p>
        </div>
        <button className="rounded-sm bg-brand-green px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-green-dark">
          + Nuovo gruppo
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {groups.map((g) => (
          <div key={g.id} className="rounded-card border border-brand-ink-10 bg-white p-4 shadow-card transition-all hover:border-brand-green hover:shadow-md cursor-pointer">
            <div className={`mb-3 flex h-[38px] w-[38px] items-center justify-center rounded-[10px] ${g.color}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke={g.stroke} strokeWidth="2" className="h-[18px] w-[18px]">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
              </svg>
            </div>
            <div className="text-[13.5px] font-medium text-brand-ink">{g.name}</div>
            <div className="mt-0.5 text-[11px] text-brand-ink-60">{g.description}</div>
            <div className="mt-3 flex items-center justify-between border-t border-brand-ink-10 pt-2.5">
              <span className="flex items-center gap-1.5 text-[11.5px] text-brand-ink-60">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                </svg>
                {g.count} contatti
              </span>
              <span className="text-[11px] font-medium text-brand-green-dark">Gestisci</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
