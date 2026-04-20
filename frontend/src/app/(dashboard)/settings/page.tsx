import Link from "next/link";
import type { ReactNode } from "react";
import { TwilioIcon } from "@/components/shared/TwilioIcon";

type Section = {
  href: string;
  title: string;
  description: string;
  icon?: ReactNode;
};

const SECTIONS: Section[] = [
  {
    href: "/settings/twilio",
    title: "Twilio WhatsApp",
    description: "Credenziali Twilio per inviare messaggi WhatsApp Business.",
    icon: <TwilioIcon size={24} colored />,
  },
  {
    href: "/settings/ai",
    title: "Intelligenza Artificiale",
    description: "Modello AI, temperatura e modalità (condivisa o BYOK).",
  },
  {
    href: "/settings/agent",
    title: "Agente AI",
    description: "Comportamento dell'agente nelle campagne.",
  },
  {
    href: "/settings/billing",
    title: "Abbonamento",
    description: "Gestisci il tuo piano e la fatturazione.",
  },
  {
    href: "/settings/team",
    title: "Team",
    description: "Invita collaboratori e gestisci i ruoli.",
  },
];

export default function SettingsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-100">Impostazioni</h1>
      <p className="mt-1 text-sm text-slate-400">
        Configura il tuo account e le integrazioni.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-xl border border-slate-800 bg-slate-900 p-5 transition-colors hover:border-brand-teal/50 hover:bg-slate-900/80"
          >
            <div className="flex items-center gap-3">
              {s.icon}
              <h2 className="font-medium text-slate-100 group-hover:text-brand-teal">
                {s.title}
              </h2>
            </div>
            <p className="mt-2 text-sm text-slate-400">{s.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
