import Link from "next/link";

const PLANS = [
  {
    name: "Starter",
    price: "49",
    features: ["5 campagne/mese", "500 contatti", "2.500 messaggi AI", "Claude Haiku", "1 utente"],
    cta: "Inizia gratis",
    popular: false,
  },
  {
    name: "Professional",
    price: "149",
    features: ["20 campagne/mese", "5.000 contatti", "15.000 messaggi AI", "Claude Sonnet", "A/B Testing", "Analytics avanzate", "3 utenti"],
    cta: "Prova gratis",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "399",
    features: ["Campagne illimitate", "50.000 contatti", "100.000 messaggi AI", "Claude Sonnet + BYOK", "White-label", "Webhook custom", "10 utenti", "Supporto dedicato"],
    cta: "Contattaci",
    popular: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0F1923] text-white">
      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-xl font-semibold tracking-tight">
          Wam<span className="text-brand-green">ply</span>
        </span>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-[13px] text-white/60 hover:text-white">Accedi</Link>
          <Link href="/register" className="rounded-pill bg-brand-green px-5 py-2 text-[13px] font-medium text-white hover:bg-brand-green-dark">
            Inizia gratis
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
        <h1 className="mx-auto max-w-3xl text-[48px] font-semibold leading-tight tracking-tight">
          Amplify your WhatsApp campaigns{" "}
          <span className="text-brand-green">with AI</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-white/60">
          Ogni contatto riceve il messaggio giusto, nel momento giusto, nella lingua giusta.
          Personalizzato dall&apos;AI. Zero spam.
        </p>

        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/register" className="rounded-pill bg-brand-green px-8 py-3 text-[15px] font-medium text-white shadow-[0_2px_12px_rgba(37,211,102,.4)] hover:bg-brand-green-dark">
            Inizia gratis
          </Link>
          <a href="#pricing" className="rounded-pill border border-white/20 px-8 py-3 text-[15px] font-medium text-white/70 hover:border-white/40 hover:text-white">
            Scopri i piani
          </a>
        </div>

        <div className="mt-10 flex items-center justify-center gap-8 text-[12px] text-white/40">
          <span>Open rate 95%</span>
          <span className="h-3 w-px bg-white/20" />
          <span>Response rate 60%</span>
          <span className="h-3 w-px bg-white/20" />
          <span>Da 49 &euro;/mese</span>
          <span className="h-3 w-px bg-white/20" />
          <span>Powered by Claude AI</span>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-white/10 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-12 text-center text-[28px] font-semibold">Come funziona</h2>
          <div className="grid grid-cols-3 gap-8">
            {[
              { step: "1", title: "Importa i contatti", desc: "Carica il tuo CSV o aggiungi contatti manualmente. Segmenta con tag e gruppi." },
              { step: "2", title: "Crea la campagna", desc: "Scegli il template, seleziona il target. L'AI personalizza ogni messaggio." },
              { step: "3", title: "Analizza i risultati", desc: "Monitora invii, consegne e letture in tempo reale. Migliora ad ogni campagna." },
            ].map((f) => (
              <div key={f.step} className="rounded-xl border border-white/10 bg-white/5 p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-brand-green text-[16px] font-semibold text-white">
                  {f.step}
                </div>
                <h3 className="mb-2 text-[16px] font-medium">{f.title}</h3>
                <p className="text-[13px] leading-relaxed text-white/50">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-white/10 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-3 text-center text-[28px] font-semibold">Piani e prezzi</h2>
          <p className="mb-12 text-center text-[14px] text-white/50">Scegli il piano adatto alla tua azienda</p>
          <div className="grid grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div key={plan.name}
                className={`rounded-xl border p-6 ${plan.popular ? "border-brand-green bg-brand-green/5 shadow-[0_0_30px_rgba(37,211,102,.1)]" : "border-white/10 bg-white/5"}`}>
                {plan.popular && (
                  <div className="mb-3 inline-block rounded-pill bg-brand-green/20 px-3 py-1 text-[11px] font-medium text-brand-green">
                    Consigliato
                  </div>
                )}
                <h3 className="text-[20px] font-semibold">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-[36px] font-semibold">{plan.price}</span>
                  <span className="text-[14px] text-white/50">&euro;/mese</span>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-[13px] text-white/70">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2.5" className="h-3.5 w-3.5 flex-shrink-0">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/register"
                  className={`mt-6 block rounded-pill py-2.5 text-center text-[13px] font-medium ${plan.popular ? "bg-brand-green text-white shadow-[0_2px_8px_rgba(37,211,102,.3)]" : "border border-white/20 text-white/70 hover:border-white/40"}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between text-[12px] text-white/30">
          <span>Wamply &copy; 2026. Tutti i diritti riservati.</span>
          <span>Powered by Claude AI &middot; Built with Next.js</span>
        </div>
      </footer>
    </div>
  );
}
