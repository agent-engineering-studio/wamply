const FAQS = [
  {
    q: "Posso provare Wamply senza inserire la carta di credito?",
    a: "Sì. Tutti i piani includono 14 giorni di trial gratuito senza vincoli. Inserisci la carta solo quando decidi di continuare.",
  },
  {
    q: "Cosa succede se supero i messaggi inclusi nel canone?",
    a: "Niente blocca le tue campagne. Continui a inviare e a fine mese paghi solo i messaggi extra alla tariffa di overage del tuo piano (es. €0,08/msg marketing su Plus).",
  },
  {
    q: "Posso cambiare piano in qualsiasi momento?",
    a: "Sì. Upgrade e downgrade sono immediati dal pannello Billing. La differenza viene proratata automaticamente sulla fattura del mese corrente.",
  },
  {
    q: "La fattura elettronica italiana è inclusa?",
    a: "Sì. Emessa via SDI con codice destinatario o PEC. Inserisci P.IVA, codice SDI e dati fiscali in fase di checkout.",
  },
  {
    q: "Devo aprire io un account WhatsApp Business API?",
    a: "No. Ci occupiamo noi del setup completo: creazione del WABA, verifica del business su Meta, attivazione del numero su Twilio. Tu inserisci solo i dati aziendali.",
  },
  {
    q: "Posso disdire quando voglio?",
    a: "Sì, in autonomia dal pannello Billing → Stripe Customer Portal. La cancellazione è effettiva alla fine del periodo già pagato, nessuna penale.",
  },
  {
    q: "Cosa sono gli AI Credits e a cosa servono?",
    a: "Sono crediti per le funzionalità AI (generazione template, riscrittura, traduzione). Si rinnovano ogni mese e non si accumulano. Su Plus ne hai 200, su Premium 1.500.",
  },
  {
    q: "Posso portare la mia API key di Anthropic/OpenAI (BYOK)?",
    a: "Sì, è disponibile sul piano Premium. Usi i tuoi crediti Claude/GPT per le funzioni AI, senza limiti imposti da noi.",
  },
  {
    q: "Cosa sono i messaggi marketing, utility e free-form?",
    a: "Marketing: promozioni e offerte (richiedono opt-in). Utility: notifiche transazionali (ordini, appuntamenti). Free-form: risposte entro 24h da un messaggio del cliente. Le tariffe seguono il listino Twilio Italia.",
  },
  {
    q: "Quante persone del mio team possono usare Wamply?",
    a: "Avvio ed Essenziale sono single-user. Plus include 3 utenti, Premium ne include 10. Per esigenze maggiori contattaci per un piano custom.",
  },
];

export function FAQ() {
  return (
    <div className="space-y-3">
      {FAQS.map(({ q, a }) => (
        <details
          key={q}
          className="group rounded-card border border-slate-800 bg-brand-navy-light px-5 py-4 transition-colors open:border-brand-teal/40"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between text-[13.5px] font-medium text-slate-100 marker:hidden">
            <span>{q}</span>
            <span className="ml-4 text-slate-500 transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">
            {a}
          </p>
        </details>
      ))}
    </div>
  );
}
