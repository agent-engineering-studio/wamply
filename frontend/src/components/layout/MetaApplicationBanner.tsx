"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface MetaApplication {
  status:
    | "draft"
    | "awaiting_docs"
    | "submitted_to_meta"
    | "in_review"
    | "approved"
    | "rejected"
    | "active"
    | "suspended";
  twilio_phone_number: string | null;
  meta_rejection_reason: string | null;
  submitted_at: string | null;
}

export function MetaApplicationBanner() {
  const [meta, setMeta] = useState<MetaApplication | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch("/settings/meta-application")
      .then((r) => r.json())
      .then((d) => {
        setMeta(d.meta_application ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) return null;
  // No application yet → no banner (user hasn't reached this stage)
  if (!meta) return null;
  // Happy path: active → no banner, everything works
  if (meta.status === "active") return null;

  switch (meta.status) {
    case "draft":
    case "awaiting_docs":
      return (
        <BannerShell
          tone="amber"
          title="Completa i dati della tua azienda"
          body="Per attivare WhatsApp ufficiale ci servono alcuni dati della tua azienda. Compilali in 2 minuti — oppure inviacieli via email e li inseriamo noi."
          cta="Completa ora"
          href="/settings/business"
        />
      );

    case "submitted_to_meta":
    case "in_review":
      return (
        <BannerShell
          tone="blue"
          title="WhatsApp in attivazione"
          body="Abbiamo inviato la tua richiesta a Meta. I tempi di approvazione vanno da 3 a 14 giorni e non dipendono da Wamply. Ti avviseremo via email appena sarà pronta."
          cta="Vedi dettagli"
          href="/settings/business"
        />
      );

    case "approved":
      return (
        <BannerShell
          tone="emerald"
          title="🎉 Il tuo WhatsApp è stato approvato"
          body="Stiamo completando la configurazione finale. Potrai mandare la prima campagna brandizzata entro poche ore."
          cta="Vai ai dettagli"
          href="/settings/business"
        />
      );

    case "rejected":
      return (
        <BannerShell
          tone="rose"
          title="Meta ha richiesto modifiche"
          body={
            meta.meta_rejection_reason
              ? `Motivo: ${meta.meta_rejection_reason}`
              : "Meta ha rifiutato la richiesta. Correggi i dati e riproveremo."
          }
          cta="Correggi dati"
          href="/settings/business"
        />
      );

    case "suspended":
      return (
        <BannerShell
          tone="rose"
          title="Sender WhatsApp sospeso"
          body="Meta ha sospeso temporaneamente il tuo sender WhatsApp. Ti contatteremo per assistenza. Nel frattempo non puoi inviare nuove campagne."
          cta="Contattaci"
          href="mailto:supporto@wamply.com"
        />
      );

    default:
      return null;
  }
}

function BannerShell({
  tone,
  title,
  body,
  cta,
  href,
}: {
  tone: "amber" | "blue" | "emerald" | "rose";
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  const palette = {
    amber: { border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-300", stroke: "#FBBF24" },
    blue: { border: "border-blue-500/30", bg: "bg-blue-500/10", text: "text-blue-300", stroke: "#60A5FA" },
    emerald: { border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-300", stroke: "#34D399" },
    rose: { border: "border-rose-500/40", bg: "bg-rose-500/10", text: "text-rose-300", stroke: "#FB7185" },
  }[tone];

  return (
    <div className={`mb-4 flex items-center gap-3 rounded-card border px-4 py-3 ${palette.border} ${palette.bg}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke={palette.stroke} strokeWidth="2" className="h-5 w-5 shrink-0">
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-semibold ${palette.text}`}>{title}</div>
        <div className="text-[11.5px] text-slate-300">{body}</div>
      </div>
      <Link
        href={href}
        className="shrink-0 rounded-pill bg-brand-teal px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-teal hover:bg-brand-teal-dark"
      >
        {cta}
      </Link>
    </div>
  );
}
