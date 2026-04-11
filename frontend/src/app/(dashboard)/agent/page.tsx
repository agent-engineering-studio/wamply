"use client";

export default function AgentPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-[15px] font-semibold text-brand-ink">Agent AI</h1>
        <p className="text-[11px] text-brand-ink-60">
          Assistente intelligente per gestire contatti, campagne e messaggi
        </p>
      </div>

      <div className="rounded-card border border-brand-teal/20 bg-brand-teal-pale p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-teal/20">
          <svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" className="h-8 w-8">
            <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1.27A7 7 0 015.27 19H4a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z" />
            <circle cx="9" cy="14" r="1" fill="#0D9488" />
            <circle cx="15" cy="14" r="1" fill="#0D9488" />
          </svg>
        </div>
        <h2 className="text-[16px] font-semibold text-brand-teal-dark">Agent AI in arrivo</h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-brand-ink-60">
          Qui potrai conversare con l&apos;agent AI per creare campagne, analizzare contatti,
          generare template e automatizzare il tuo marketing su WhatsApp.
        </p>
        <div className="mt-6 flex items-center justify-center gap-6 text-[11px] text-brand-ink-30">
          <span>&ldquo;Crea una campagna per i clienti VIP&rdquo;</span>
          <span>&ldquo;Quanti messaggi ho inviato questo mese?&rdquo;</span>
          <span>&ldquo;Genera un template di benvenuto&rdquo;</span>
        </div>
      </div>
    </>
  );
}
