"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface AgentStatus {
  active: boolean;
  has_byok: boolean;
  ai_credits_limit: number;
  ai_credits_used: number;
  topup_credits: number;
  plan_slug?: string;
}

export function CreditsBanner() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch("/settings/agent-status")
      .then((r) => r.json())
      .then((d) => {
        setStatus(d);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded || !status) return null;
  // BYOK users bypass credits entirely.
  if (status.has_byok) return null;
  // Plans with no system-key budget and no topup — nothing to warn about.
  if (status.ai_credits_limit <= 0) return null;

  const used = status.ai_credits_used;
  const limit = status.ai_credits_limit;
  const pct = limit > 0 ? used / limit : 0;
  const hasTopup = status.topup_credits > 0;

  // Hard exhaustion: plan AND topup both drained
  if (used >= limit && !hasTopup) {
    return (
      <BannerShell
        tone="rose"
        title="Crediti AI esauriti"
        body="Hai usato tutti i crediti AI del tuo piano di questo mese. Ricarica con un pacchetto o passa a un piano superiore per continuare."
        cta="Ricarica crediti"
      />
    );
  }

  // Warning at 80% of plan budget (topup not yet drawn)
  if (pct >= 0.8 && pct < 1.0) {
    return (
      <BannerShell
        tone="amber"
        title={`Hai usato ${used.toFixed(0)}/${limit} crediti AI`}
        body="Stai per esaurire i crediti AI del mese. Valuta un pacchetto top-up per non interrompere il servizio."
        cta="Ricarica crediti"
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
        <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1.27A7 7 0 015.27 19H4a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z" />
        <circle cx="9" cy="14" r="1" fill={palette.stroke} />
        <circle cx="15" cy="14" r="1" fill={palette.stroke} />
      </svg>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-semibold ${palette.text}`}>{title}</div>
        <div className="text-[11.5px] text-slate-300">{body}</div>
      </div>
      <Link
        href="/settings/credits"
        className="shrink-0 rounded-pill bg-brand-teal px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-teal hover:bg-brand-teal-dark"
      >
        {cta}
      </Link>
    </div>
  );
}
