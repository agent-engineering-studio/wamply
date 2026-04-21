"use client";

import { useState } from "react";

const QA: { q: string; a: React.ReactNode }[] = [
  {
    q: "Cosa sono i crediti AI?",
    a: (
      <>
        Una misura unica per tutte le operazioni di intelligenza artificiale di Wamply.
        Ogni operazione costa un numero diverso di crediti a seconda della complessità:
        <ul className="mt-2 list-disc pl-5 space-y-0.5">
          <li>Chat con agent AI — 1 credito</li>
          <li>Chat che esegue azioni (crea campagna, filtra contatti, …) — 2 crediti</li>
          <li>Chat di pianificazione campagna (analisi approfondita) — 3 crediti</li>
          <li>Generazione template — 2 crediti</li>
          <li>Miglioramento template (3 varianti) — 3 crediti</li>
          <li>Controllo compliance WhatsApp (analisi approfondita) — 3 crediti</li>
          <li>Traduzione template — 1 credito per lingua</li>
          <li>Personalizzazione messaggio nelle campagne — 0,5 crediti</li>
        </ul>
      </>
    ),
  },
  {
    q: "Cosa succede se finisco i crediti?",
    a: (
      <>
        Le funzionalità AI vengono bloccate fino al rinnovo mensile del tuo piano.
        Puoi acquistare pacchetti di crediti aggiuntivi che restano validi per 12 mesi,
        oppure passare a un piano con un budget mensile più alto.
      </>
    ),
  },
  {
    q: "Posso usare la mia chiave Claude al posto dei crediti?",
    a: (
      <>
        Sì, da qualsiasi piano pagante. Configurando la tua API key Claude in
        <span className="text-brand-teal"> Impostazioni → AI</span> paghi direttamente Anthropic
        per il tuo consumo effettivo, senza limiti Wamply. In questo caso i crediti non
        vengono conteggiati e i pacchetti top-up non sono necessari.
      </>
    ),
  },
  {
    q: "I crediti top-up scadono?",
    a: (
      <>
        Sì, ogni pacchetto resta valido 12 mesi dall&apos;ultimo acquisto. Acquistando un nuovo
        pacchetto, la scadenza di tutti i crediti top-up esistenti viene prolungata.
      </>
    ),
  },
  {
    q: "Posso avere un rimborso per un pacchetto non usato?",
    a: (
      <>
        Sì, entro 14 giorni dall&apos;acquisto e solo se non hai consumato nemmeno un credito
        del pacchetto. Contattaci via email per richiedere il rimborso.
      </>
    ),
  },
];

export function CreditsFAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5">
      <h2 className="mb-3 text-[15px] font-semibold text-slate-100">Domande frequenti</h2>
      <div className="space-y-1.5">
        {QA.map((item, idx) => {
          const open = openIdx === idx;
          return (
            <div key={idx} className="border-b border-slate-800/50 last:border-0">
              <button
                type="button"
                onClick={() => setOpenIdx(open ? null : idx)}
                className="flex w-full items-center justify-between gap-2 py-2.5 text-left text-[13px] text-slate-100 hover:text-white"
              >
                <span>{item.q}</span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {open && (
                <div className="pb-3 text-[12.5px] leading-relaxed text-slate-300">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
