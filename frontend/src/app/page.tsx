import Link from "next/link";

type Plan = {
  name: string;
  price: string;
  priceUnit?: string;
  priceSuffix?: string;
  features: string[];
  cta: string;
  popular: boolean;
  trial?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Free Trial",
    price: "14",
    priceUnit: "giorni",
    priceSuffix: "Nessuna carta richiesta",
    features: ["20 campagne / 5.000 contatti", "15.000 messaggi AI", "Claude Sonnet", "A/B Testing + Analytics", "Nessuna carta richiesta"],
    cta: "Inizia 14 giorni gratis",
    popular: false,
    trial: true,
  },
  {
    name: "Starter",
    price: "49",
    features: ["5 campagne/mese", "500 contatti", "2.500 messaggi AI", "Claude Haiku", "1 utente"],
    cta: "Scegli Starter",
    popular: false,
  },
  {
    name: "Professional",
    price: "149",
    features: ["20 campagne/mese", "5.000 contatti", "15.000 messaggi AI", "Claude Sonnet", "A/B Testing", "Analytics avanzate", "3 utenti"],
    cta: "Scegli Professional",
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
            Inizia 14 giorni gratis
          </Link>
          <a href="#pricing" className="rounded-pill border border-brand-slate px-8 py-3 text-[15px] font-medium text-brand-slate-light hover:border-brand-slate-light hover:text-white transition-colors">
            Scopri i piani
          </a>
        </div>

        <div className="relative mt-10 flex items-center justify-center gap-8 text-[12px] text-brand-slate-muted">
          <span><span className="text-brand-green">14 giorni gratis</span></span>
          <span className="h-3 w-px bg-white/15" />
          <span>Nessuna carta richiesta</span>
          <span className="h-3 w-px bg-white/15" />
          <span>Open rate 95%</span>
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
          <div className="grid grid-cols-4 gap-5">
            {PLANS.map((plan) => {
              const cardBorder = plan.trial
                ? "border-brand-green/40 bg-brand-green/5 shadow-[0_0_30px_rgba(37,211,102,.10)]"
                : plan.popular
                ? "border-brand-teal bg-brand-teal/5 shadow-[0_0_30px_rgba(13,148,136,.12)]"
                : "border-white/10 bg-white/5";
              const ctaStyle = plan.trial
                ? "bg-brand-green text-white hover:bg-brand-green-dark"
                : plan.popular
                ? "bg-brand-teal text-white shadow-teal hover:bg-brand-teal-dark"
                : "border border-white/20 text-white/70 hover:border-brand-teal/50 hover:text-white";
              const checkColor = plan.trial ? "#25D366" : "#0D9488";
              return (
                <div key={plan.name} className={`rounded-xl border p-6 ${cardBorder}`}>
                  {plan.trial && (
                    <div className="mb-3 inline-block rounded-pill bg-brand-green/20 px-3 py-1 text-[11px] font-medium text-brand-green">
                      Prova gratuita
                    </div>
                  )}
                  {plan.popular && (
                    <div className="mb-3 inline-block rounded-pill bg-brand-teal/20 px-3 py-1 text-[11px] font-medium text-brand-teal">
                      Consigliato
                    </div>
                  )}
                  <h3 className="text-[20px] font-semibold">{plan.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-[36px] font-semibold">{plan.price}</span>
                    <span className="text-[14px] text-brand-slate-light">
                      {plan.trial ? plan.priceUnit : <>&euro;/mese</>}
                    </span>
                  </div>
                  {plan.trial && (
                    <p className="mt-1 text-[11px] text-brand-green/80">
                      {plan.priceSuffix}
                    </p>
                  )}
                  <ul className="mt-6 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-[13px] text-white/70">
                        <svg viewBox="0 0 24 24" fill="none" stroke={checkColor} strokeWidth="2.5" className="h-3.5 w-3.5 shrink-0">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/register"
                    className={`mt-6 block rounded-pill py-2.5 text-center text-[13px] font-medium transition-colors ${ctaStyle}`}>
                    {plan.cta}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Payment security */}
      <section className="border-t border-white/10 py-14">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="mb-6 text-[12px] uppercase tracking-widest text-brand-slate-muted">Pagamenti sicuri</p>
          <div className="flex flex-wrap items-center justify-center gap-5">
            {/* Stripe logo */}
            <div className="inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-sm">
              <svg viewBox="0 0 60 25" className="h-6 w-auto" aria-label="Stripe">
                <path fill="#635BFF" d="M59.5 14.34c0-4.38-2.12-7.84-6.18-7.84s-6.52 3.46-6.52 7.81c0 5.15 2.91 7.75 7.07 7.75 2.03 0 3.56-.46 4.72-1.11v-3.42c-1.16.58-2.49.94-4.18.94-1.66 0-3.12-.58-3.31-2.6h8.34c0-.22.06-1.1.06-1.53zm-8.43-1.63c0-1.93 1.18-2.74 2.26-2.74 1.05 0 2.16.81 2.16 2.74zm-10.84-6.21c-1.67 0-2.74.78-3.34 1.33l-.22-1.05h-3.75v19.95l4.27-.91.01-4.84c.61.45 1.52 1.07 3.02 1.07 3.06 0 5.85-2.46 5.85-7.88-.02-4.96-2.83-7.67-5.84-7.67zm-1.02 11.8c-1 0-1.6-.36-2.01-.8l-.03-6.32c.45-.49 1.06-.83 2.04-.83 1.57 0 2.65 1.76 2.65 3.96 0 2.26-1.07 3.99-2.65 3.99zm-12.14-12.05l4.28-.92V2.13l-4.28.9zM27.07 6.79h4.29v14.96h-4.29zm-4.59 1.27L22.2 6.79h-3.7v14.96h4.28V11.62c1.02-1.32 2.73-1.08 3.26-.89V6.79c-.54-.2-2.56-.55-3.56 1.27zm-8.52-5.12L9.8 3.86l-.01 13.72c0 2.54 1.9 4.4 4.43 4.4 1.4 0 2.42-.26 2.99-.56V17.9c-.55.22-3.25 1.01-3.25-1.52v-6.08h3.25V6.79h-3.25zM4.34 11.02c0-.66.55-.92 1.45-.92 1.29 0 2.93.4 4.22 1.09v-4c-1.41-.56-2.8-.78-4.22-.78C2.33 6.41 0 8.21 0 11.22c0 4.69 6.47 3.94 6.47 5.96 0 .78-.68 1.04-1.62 1.04-1.41 0-3.21-.58-4.63-1.37v4.05c1.57.68 3.17.96 4.63.96 3.55 0 6.02-1.75 6.02-4.79-.02-5.06-6.53-4.16-6.53-6.05z"/>
              </svg>
            </div>

            {/* PCI DSS */}
            <div className="inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" className="h-5 w-5">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <div className="text-left">
                <div className="text-[12.5px] font-medium text-white/90">PCI DSS Level 1</div>
                <div className="text-[10.5px] text-brand-slate-muted">Massimo standard sicurezza</div>
              </div>
            </div>

            {/* 3D Secure */}
            <div className="inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" className="h-5 w-5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
              <div className="text-left">
                <div className="text-[12.5px] font-medium text-white/90">3D Secure 2</div>
                <div className="text-[10.5px] text-brand-slate-muted">Autenticazione forte SCA</div>
              </div>
            </div>

            {/* TLS / HTTPS */}
            <div className="inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" className="h-5 w-5">
                <path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z" />
              </svg>
              <div className="text-left">
                <div className="text-[12.5px] font-medium text-white/90">Cifratura TLS 1.3</div>
                <div className="text-[10.5px] text-brand-slate-muted">Dati protetti end-to-end</div>
              </div>
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-lg text-[12px] leading-relaxed text-brand-slate-muted">
            I dati della carta non transitano mai dai nostri server. Ogni pagamento è gestito direttamente da
            Stripe, uno dei leader mondiali nei pagamenti online, certificato PCI DSS Level 1.
          </p>
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

      {/* Developed by */}
      <section className="border-t border-white/10 py-10">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="mb-4 text-[12px] uppercase tracking-widest text-brand-slate-muted">Developed by</p>
          <a
            href="https://www.agentengineering.it"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-8 py-4 backdrop-blur-sm transition-colors hover:border-brand-teal/30 hover:bg-white/8"
          >
            <img
              src="/agent-engineering-icon.png"
              alt="Agent Engineering Studio"
              className="h-10 w-10 rounded-lg object-contain"
            />
            <img
              src="/agent-engineering-logo.png"
              alt="Agent Engineering Studio"
              className="h-8 w-auto object-contain"
            />
          </a>
          <p className="mx-auto mt-4 max-w-md text-[12px] leading-relaxed text-brand-slate-muted">
            Progettato e sviluppato da{" "}
            <a href="https://www.agentengineering.it" target="_blank" rel="noopener noreferrer" className="text-brand-teal hover:underline">
              Agent Engineering Studio
            </a>
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
