import Link from "next/link";

const SECTIONS = [
  {
    href: "/settings/whatsapp",
    title: "WhatsApp Business",
    description: "Configura il collegamento con la Meta Cloud API.",
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
      <h1 className="text-2xl font-semibold text-slate-900">Impostazioni</h1>
      <p className="mt-1 text-sm text-slate-500">
        Configura il tuo account e le integrazioni.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <h2 className="font-medium text-slate-900 group-hover:text-brand-green-dark">
              {s.title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{s.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
