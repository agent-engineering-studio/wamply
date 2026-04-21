import Link from "next/link";

type Plan = {
  name: string;
  slug: string;
  cta: string;
  popular: boolean;
  trial?: boolean;
};

const PLANS: Plan[] = [
  { name: "Free Trial",   slug: "free",         cta: "Inizia 14 giorni gratis", popular: false, trial: true },
  { name: "Starter",      slug: "starter",      cta: "Scegli Starter",          popular: false },
  { name: "Professional", slug: "professional", cta: "Scegli Professional",     popular: true  },
  { name: "Enterprise",   slug: "enterprise",   cta: "Contattaci",              popular: false },
];

/* Agent Engineering Studio — inline SVG reconstruction (A + AI hexagon + circuits) */
function AEStudioLogo({ className = "h-5 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 64" className={className} aria-label="Agent Engineering Studio">
      <defs>
        <linearGradient id="aeBlue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </linearGradient>
        <linearGradient id="aeGray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
      </defs>
      {/* A shape: blue left face (triangle) */}
      <polygon points="6,56 26,8 34,8 20,56" fill="url(#aeBlue)" />
      {/* A shape: gray right face giving 3D depth */}
      <polygon points="26,8 34,8 42,56 20,56" fill="url(#aeGray)" opacity="0.85" />
      {/* Horizontal E-style bars inside A */}
      <rect x="18" y="22" width="20" height="5" fill="#CBD5E1" />
      <rect x="20" y="32" width="20" height="5" fill="#CBD5E1" />
      <rect x="22" y="42" width="20" height="5" fill="#CBD5E1" />
      {/* AI hexagon */}
      <polygon points="58,10 72,10 79,22 72,34 58,34 51,22" fill="#2563EB" stroke="#1E3A8A" strokeWidth="1" />
      <text x="65" y="26" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle" fontFamily="Inter, sans-serif">AI</text>
      {/* Circuit lines from hexagon */}
      <path d="M 79 16 L 92 12" stroke="#3B82F6" strokeWidth="1.2" fill="none" />
      <circle cx="94" cy="11" r="1.4" fill="#3B82F6" />
      <path d="M 79 22 L 96 22" stroke="#3B82F6" strokeWidth="1.2" fill="none" />
      <circle cx="98" cy="22" r="1.4" fill="#3B82F6" />
      <path d="M 79 28 L 92 32" stroke="#3B82F6" strokeWidth="1.2" fill="none" />
      <circle cx="94" cy="33" r="1.4" fill="#3B82F6" />
      {/* Wordmark */}
      <text x="60" y="54" fontSize="9" fontWeight="600" fill="currentColor" textAnchor="middle" fontFamily="Inter, sans-serif" letterSpacing="0.5">
        AGENT ENGINEERING
      </text>
    </svg>
  );
}

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

      {/* AI spotlight — the core value proposition */}
      <section className="relative overflow-hidden border-t border-white/10 py-24">
        {/* subtle radial glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[500px] w-[500px] rounded-full bg-brand-teal/10 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6">
          <div className="mb-5 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-pill border border-brand-teal/30 bg-brand-teal/10 px-4 py-1.5 text-[12px] font-medium text-brand-teal">
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
                <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zM19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zM5 15l.8 2.5L8 18l-2.2.5L5 21l-.8-2.5L2 18l2.2-.5L5 15z" fill="currentColor"/>
              </svg>
              AI AL CENTRO
            </span>
          </div>

          <h2 className="mx-auto max-w-3xl text-center text-[38px] font-semibold leading-[1.15] tracking-tight">
            L&apos;AI che <span className="text-brand-teal">scrive per te</span>, ogni singolo messaggio.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-center text-[16px] leading-relaxed text-brand-slate-light">
            Niente template con variabili da compilare a mano. Un <strong className="text-white">messaggio unico</strong> per ogni destinatario, generato da{" "}
            <strong className="text-brand-teal">Claude</strong> di Anthropic. Tu dai l&apos;obiettivo — l&apos;AI scrive, personalizza, ottimizza. E migliora a ogni campagna.
          </p>

          <div className="mt-14 grid grid-cols-4 gap-5">
            {[
              {
                title: "Scrive il copy",
                desc: "Un brief basta: l'AI produce testi in tono naturale, adattati al tuo brand.",
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                    <path d="M4 19l4.5-1.5L18 8l-3-3L5.5 14.5 4 19z" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 6l4 4" strokeLinecap="round"/>
                    <path d="M19 3l1 1M17 2l1 2M21 5l-1 1" strokeLinecap="round"/>
                  </svg>
                ),
              },
              {
                title: "Segmenta i contatti",
                desc: "Capisce chi è pronto all'offerta, chi va riscaldato, chi è meglio escludere.",
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                    <circle cx="9" cy="8" r="3"/>
                    <path d="M3 20c0-3.5 2.5-6 6-6s6 2.5 6 6" strokeLinecap="round"/>
                    <circle cx="17" cy="6" r="2"/>
                    <path d="M14 13c1 0 4 .5 4 3" strokeLinecap="round"/>
                  </svg>
                ),
              },
              {
                title: "Parla la loro lingua",
                desc: "50+ lingue. Tono formale o amichevole, scelto in base al contesto del cliente.",
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                    <circle cx="12" cy="12" r="9"/>
                    <path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>
                  </svg>
                ),
              },
              {
                title: "Impara dai risultati",
                desc: "Ogni risposta è feedback: l'AI affina il tono e il timing per la campagna successiva.",
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                    <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M15 7h6v6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
              },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-colors hover:border-brand-teal/40 hover:bg-white/8">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-teal/15 text-brand-teal">
                  {f.icon}
                </div>
                <h3 className="mb-1.5 text-[15px] font-semibold text-white">{f.title}</h3>
                <p className="text-[13px] leading-relaxed text-brand-slate-light">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 flex flex-wrap items-center justify-center gap-6 text-[13px] text-brand-slate-muted">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-teal" />
              <span>Tempo di preparazione campagna</span>
              <strong className="text-white">da ore a minuti</strong>
            </span>
            <span className="h-3 w-px bg-white/15" />
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-teal" />
              <span>Response rate medio</span>
              <strong className="text-white">3× vs broadcast</strong>
            </span>
            <span className="h-3 w-px bg-white/15" />
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-teal" />
              <strong className="text-white">Zero spam</strong>
              <span>per design</span>
            </span>
          </div>
        </div>
      </section>

      {/* How it works — 3-step flow with AI co-pilot narrative */}
      <section className="border-t border-white/10 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-3 text-center text-[28px] font-semibold">Come funziona</h2>
          <p className="mb-12 text-center text-[14px] text-brand-slate-light">L&apos;AI guida ogni fase — tu supervisioni e approvi</p>
          <div className="grid grid-cols-3 gap-8">
            {[
              { step: "1", title: "Porta i tuoi contatti", desc: "Carica un CSV o aggiungi a mano. L'AI analizza tag, storico e dati per suggerire subito i segmenti più promettenti." },
              { step: "2", title: "Descrivi l'obiettivo", desc: "Dici all'AI cosa vuoi ottenere — l'agent scrive il copy, personalizza per ogni destinatario, pianifica l'invio nel momento giusto." },
              { step: "3", title: "Raccogli i risultati", desc: "Monitora invii, letture e risposte in tempo reale. L'AI ti dice cosa ha funzionato e come migliorare la prossima campagna." },
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
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-3 text-center text-[28px] font-semibold">Piani e prezzi</h2>
          <p className="mb-6 text-center text-[14px] text-brand-slate-light">Scegli il piano adatto alla tua azienda</p>
          <div className="mb-12 flex justify-center">
            <a
              href="https://www.agentengineering.it"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-pill border border-white/10 bg-white/5 px-4 py-2 text-[11px] text-brand-slate-muted backdrop-blur-sm transition-colors hover:border-brand-teal/30 hover:text-white"
            >
              <span className="uppercase tracking-widest">Designed by</span>
              <AEStudioLogo className="h-7 w-auto" />
            </a>
          </div>
          <div className="grid grid-cols-2 gap-8">
            {PLANS.map((plan) => {
              const wrapperRing = plan.trial
                ? "ring-2 ring-brand-green/40 shadow-[0_0_40px_rgba(37,211,102,.15)]"
                : plan.popular
                ? "ring-2 ring-brand-teal shadow-[0_0_40px_rgba(13,148,136,.18)]"
                : "ring-1 ring-white/10";
              const ctaStyle = plan.trial
                ? "bg-brand-green text-white hover:bg-brand-green-dark"
                : plan.popular
                ? "bg-brand-teal text-white shadow-teal hover:bg-brand-teal-dark"
                : "border border-white/20 text-white/70 hover:border-brand-teal/50 hover:text-white";
              return (
                <div key={plan.name} className={`flex flex-col overflow-hidden rounded-2xl ${wrapperRing}`}>
                  <img
                    src={`/stripe/wamply-${plan.slug}-banner.png`}
                    alt={`Piano ${plan.name} Wamply`}
                    className="block aspect-square w-full object-cover"
                  />
                  <div className="bg-brand-navy-deep p-5">
                    <Link href="/register"
                      className={`block rounded-pill py-3 text-center text-[14px] font-medium transition-colors ${ctaStyle}`}>
                      {plan.cta}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer — single compact row with trust signals and credits */}
      <footer className="border-t border-white/10 bg-brand-navy-deep py-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 text-[12px] text-brand-slate-muted">
          {/* Left: brand + copyright */}
          <div className="flex items-center gap-2.5">
            <WaveLogo className="h-5 w-5" />
            <span>Wamply &copy; 2026 &middot; Tutti i diritti riservati</span>
          </div>

          {/* Center: trust badges (Stripe, security, Claude AI) */}
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
            <span className="inline-flex items-center" title="Pagamenti Stripe">
              <svg viewBox="0 0 60 25" className="h-3.5 w-auto" aria-label="Stripe">
                <path fill="#635BFF" d="M59.5 14.34c0-4.38-2.12-7.84-6.18-7.84s-6.52 3.46-6.52 7.81c0 5.15 2.91 7.75 7.07 7.75 2.03 0 3.56-.46 4.72-1.11v-3.42c-1.16.58-2.49.94-4.18.94-1.66 0-3.12-.58-3.31-2.6h8.34c0-.22.06-1.1.06-1.53zm-8.43-1.63c0-1.93 1.18-2.74 2.26-2.74 1.05 0 2.16.81 2.16 2.74zm-10.84-6.21c-1.67 0-2.74.78-3.34 1.33l-.22-1.05h-3.75v19.95l4.27-.91.01-4.84c.61.45 1.52 1.07 3.02 1.07 3.06 0 5.85-2.46 5.85-7.88-.02-4.96-2.83-7.67-5.84-7.67zm-1.02 11.8c-1 0-1.6-.36-2.01-.8l-.03-6.32c.45-.49 1.06-.83 2.04-.83 1.57 0 2.65 1.76 2.65 3.96 0 2.26-1.07 3.99-2.65 3.99zm-12.14-12.05l4.28-.92V2.13l-4.28.9zM27.07 6.79h4.29v14.96h-4.29zm-4.59 1.27L22.2 6.79h-3.7v14.96h4.28V11.62c1.02-1.32 2.73-1.08 3.26-.89V6.79c-.54-.2-2.56-.55-3.56 1.27zm-8.52-5.12L9.8 3.86l-.01 13.72c0 2.54 1.9 4.4 4.43 4.4 1.4 0 2.42-.26 2.99-.56V17.9c-.55.22-3.25 1.01-3.25-1.52v-6.08h3.25V6.79h-3.25zM4.34 11.02c0-.66.55-.92 1.45-.92 1.29 0 2.93.4 4.22 1.09v-4c-1.41-.56-2.8-.78-4.22-.78C2.33 6.41 0 8.21 0 11.22c0 4.69 6.47 3.94 6.47 5.96 0 .78-.68 1.04-1.62 1.04-1.41 0-3.21-.58-4.63-1.37v4.05c1.57.68 3.17.96 4.63.96 3.55 0 6.02-1.75 6.02-4.79-.02-5.06-6.53-4.16-6.53-6.05z"/>
              </svg>
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span className="text-white/60">PCI DSS &middot; 3D Secure &middot; TLS 1.3</span>
            <span className="h-3 w-px bg-white/10" />
            <span className="inline-flex items-center gap-1.5" title="Powered by Anthropic Claude">
              <svg viewBox="0 0 46 32" className="h-3 w-auto" fill="none">
                <path d="M32.73 0H27.2l12.8 32h5.53L32.73 0zM12.8 0L0 32h5.67l2.63-6.74h13.41L24.33 32H30L17.2 0h-4.4zm-1.96 20.37L15 10.2l4.16 10.17H10.84z" fill="#D4A27F"/>
              </svg>
              <span className="text-white/60">Claude AI</span>
            </span>
          </div>

          {/* Right: Agent Engineering credit */}
          <a
            href="https://www.agentengineering.it"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 transition-colors hover:text-white"
          >
            <span className="text-[10px] uppercase tracking-widest">Designed by</span>
            <AEStudioLogo className="h-6 w-auto" />
          </a>
        </div>
      </footer>
    </div>
  );
}
