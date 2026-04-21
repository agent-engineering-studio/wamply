"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Subscription {
  status: "trialing" | "active" | "past_due" | "canceled";
  plan: { name: string; slug: string };
  current_period_end: string | null;
  trial_days_remaining: number | null;
}

export function TrialBanner() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch("/settings/subscription")
      .then((r) => r.json())
      .then((d) => {
        setSub(d.subscription ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded || !sub) return null;

  // Free plan = trial expired, access blocked — permanent red banner.
  if (sub.plan.slug === "free") {
    return (
      <BannerShell
        tone="rose"
        title="Trial terminato"
        body="Il tuo periodo di prova è scaduto. Scegli un piano per riattivare l'accesso a campagne, contatti e agent AI."
        cta="Scegli un piano"
      />
    );
  }

  // Failed payment: subscription suspended until payment is retried successfully.
  if (sub.status === "past_due") {
    return (
      <BannerShell
        tone="rose"
        title="Pagamento non riuscito"
        body="Il rinnovo del tuo abbonamento è fallito. Aggiorna il metodo di pagamento per continuare a usare Wamply."
        cta="Aggiorna pagamento"
      />
    );
  }

  // Active trial: amber countdown, rose when <= 1 day left.
  if (sub.status === "trialing") {
    const days = sub.trial_days_remaining ?? 0;
    const urgent = days <= 1;
    const label = days === 0
      ? "Il trial scade oggi"
      : days === 1
        ? "Il trial scade domani"
        : `${days} giorni rimanenti nel trial`;
    return (
      <BannerShell
        tone={urgent ? "rose" : "amber"}
        title={label}
        body={`Stai usando ${sub.plan.name} in modalità trial. Scegli un piano prima della scadenza per non perdere l'accesso.`}
        cta="Scegli un piano"
      />
    );
  }

  return null;
}

function BannerShell({
  tone,
  title,
  body,
  cta,
}: {
  tone: "rose" | "amber";
  title: string;
  body: string;
  cta: string;
}) {
  const palette = tone === "rose"
    ? { border: "border-rose-500/40", bg: "bg-rose-500/10", text: "text-rose-300", stroke: "#FB7185" }
    : { border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-300", stroke: "#FBBF24" };
  return (
    <div className={`mb-4 flex items-center gap-3 rounded-card border px-4 py-3 ${palette.border} ${palette.bg}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke={palette.stroke} strokeWidth="2" className="h-5 w-5 shrink-0">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-semibold ${palette.text}`}>{title}</div>
        <div className="text-[11.5px] text-slate-300">{body}</div>
      </div>
      <Link
        href="/settings/billing"
        className="shrink-0 rounded-pill bg-brand-teal px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-teal hover:bg-brand-teal-dark"
      >
        {cta}
      </Link>
    </div>
  );
}
