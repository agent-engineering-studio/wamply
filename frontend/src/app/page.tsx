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

/* W-wave inline logo from brand SVG */
function WaveLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={className}>
      <defs>
        <linearGradient id="logoBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1B2A4A" />
          <stop offset="100%" stopColor="#0F1B33" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" rx="80" fill="url(#logoBg)" />
      <path d="M90 140 L130 290 L170 190 L200 290 L230 190 L270 290 L310 140" fill="none" stroke="#fff" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M90 140 L130 290 L170 190 L200 290 L230 190 L270 290 L310 140" fill="none" stroke="#0D9488" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx="320" cy="132" r="8" fill="#0D9488" opacity="0.9" />
      <circle cx="336" cy="120" r="5" fill="#0D9488" opacity="0.6" />
      <circle cx="348" cy="112" r="3" fill="#0D9488" opacity="0.35" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-brand-navy via-brand-navy-light to-brand-navy-deep text-white">
      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <WaveLogo className="h-9 w-9" />
          <span className="text-xl font-semibold tracking-tight">
            Wam<span className="text-brand-teal">ply</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-[13px] text-white/60 hover:text-white transition-colors">Accedi</Link>
          <Link href="/register" className="rounded-pill bg-brand-teal px-5 py-2 text-[13px] font-medium text-white shadow-teal hover:bg-brand-teal-dark transition-colors">
            Inizia gratis
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
        {/* Decorative signal rings */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden opacity-[0.06]">
          <div className="h-160 w-160 rounded-full border border-brand-teal" />
          <div className="absolute h-120 w-120 rounded-full border border-brand-teal" />
          <div className="absolute h-80 w-80 rounded-full border border-brand-teal" />
        </div>

        <h1 className="relative mx-auto max-w-3xl text-[48px] font-semibold leading-tight tracking-tight">
          Amplify your WhatsApp campaigns{" "}
          <span className="text-brand-teal">with AI</span>
        </h1>
        <p className="relative mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-brand-slate-light">
          Ogni contatto riceve il messaggio giusto, nel momento giusto, nella lingua giusta.
          Personalizzato dall&apos;AI. Zero spam.
        </p>

        <div className="relative mt-8 flex items-center justify-center gap-4">
          <Link href="/register" className="rounded-pill bg-brand-teal px-8 py-3 text-[15px] font-medium text-white shadow-teal hover:bg-brand-teal-dark transition-colors">
            Inizia gratis
          </Link>
          <a href="#pricing" className="rounded-pill border border-brand-slate px-8 py-3 text-[15px] font-medium text-brand-slate-light hover:border-brand-slate-light hover:text-white transition-colors">
            Scopri i piani
          </a>
        </div>

        <div className="relative mt-10 flex items-center justify-center gap-8 text-[12px] text-brand-slate-muted">
          <span>Open rate 95%</span>
          <span className="h-3 w-px bg-white/15" />
          <span>Response rate 60%</span>
          <span className="h-3 w-px bg-white/15" />
          <span>Da 49 &euro;/mese</span>
          <span className="h-3 w-px bg-white/15" />
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
              <div key={f.step} className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-brand-teal text-[16px] font-semibold text-white">
                  {f.step}
                </div>
                <h3 className="mb-2 text-[16px] font-medium">{f.title}</h3>
                <p className="text-[13px] leading-relaxed text-brand-slate-light">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-white/10 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-3 text-center text-[28px] font-semibold">Piani e prezzi</h2>
          <p className="mb-12 text-center text-[14px] text-brand-slate-light">Scegli il piano adatto alla tua azienda</p>
          <div className="grid grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div key={plan.name}
                className={`rounded-xl border p-6 ${plan.popular ? "border-brand-teal bg-brand-teal/5 shadow-[0_0_30px_rgba(13,148,136,.12)]" : "border-white/10 bg-white/5"}`}>
                {plan.popular && (
                  <div className="mb-3 inline-block rounded-pill bg-brand-teal/20 px-3 py-1 text-[11px] font-medium text-brand-teal">
                    Consigliato
                  </div>
                )}
                <h3 className="text-[20px] font-semibold">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-[36px] font-semibold">{plan.price}</span>
                  <span className="text-[14px] text-brand-slate-light">&euro;/mese</span>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-[13px] text-white/70">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.5" className="h-3.5 w-3.5 shrink-0">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/register"
                  className={`mt-6 block rounded-pill py-2.5 text-center text-[13px] font-medium transition-colors ${plan.popular ? "bg-brand-teal text-white shadow-teal hover:bg-brand-teal-dark" : "border border-white/20 text-white/70 hover:border-brand-teal/50 hover:text-white"}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Powered by Anthropic */}
      <section className="border-t border-white/10 py-16">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="mb-6 text-[12px] uppercase tracking-widest text-brand-slate-muted">Intelligenza artificiale powered by</p>
          <div className="flex items-center justify-center gap-8">
            {/* Anthropic Logo */}
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 46 32" className="h-8 w-auto" fill="none">
                <path d="M32.73 0H27.2l12.8 32h5.53L32.73 0zM12.8 0L0 32h5.67l2.63-6.74h13.41L24.33 32H30L17.2 0h-4.4zm-1.96 20.37L15 10.2l4.16 10.17H10.84z" fill="#D4A27F"/>
              </svg>
              <div className="text-left">
                <div className="text-[14px] font-medium text-white/80">Anthropic</div>
                <div className="text-[11px] text-brand-slate-muted">Claude AI</div>
              </div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="rounded-pill border border-white/10 bg-white/5 px-5 py-2">
              <span className="text-[12px] text-brand-slate-light">
                Ogni messaggio personalizzato da <strong className="text-brand-teal">Claude</strong> — l&apos;AI di Anthropic
              </span>
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-lg text-[12px] leading-relaxed text-brand-slate-muted">
            Wamply utilizza i modelli Claude Sonnet e Haiku di Anthropic per personalizzare
            ogni messaggio WhatsApp in modo unico per ciascun destinatario, con tono naturale
            e rispetto della privacy.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between text-[12px] text-brand-slate-muted">
          <span>Wamply &copy; 2026. Tutti i diritti riservati.</span>
          <div className="flex items-center gap-2">
            <span>Powered by</span>
            <svg viewBox="0 0 46 32" className="h-3.5 w-auto" fill="none">
              <path d="M32.73 0H27.2l12.8 32h5.53L32.73 0zM12.8 0L0 32h5.67l2.63-6.74h13.41L24.33 32H30L17.2 0h-4.4zm-1.96 20.37L15 10.2l4.16 10.17H10.84z" fill="#D4A27F"/>
            </svg>
            <span>Claude AI &middot; Built with Next.js</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
