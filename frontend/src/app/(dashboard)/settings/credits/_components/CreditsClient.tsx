"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { CreditsBalanceCard } from "./CreditsBalanceCard";
import { TopupPackGrid } from "./TopupPackGrid";
import { UsageBreakdown } from "./UsageBreakdown";
import { PurchaseHistory } from "./PurchaseHistory";
import { CreditsFAQ } from "./CreditsFAQ";

export interface AgentStatus {
  active: boolean;
  reason: "byok" | "plan" | "inactive";
  has_byok: boolean;
  plan_has_agent: boolean;
  system_key_set: boolean;
  ai_credits_limit: number;
  ai_credits_used: number;
  ai_credits_remaining: number;
  source: "byok" | "system_key" | "none";
  topup_credits: number;
  topup_expires_at: string | null;
  plan_slug?: string;
}

export interface Pack {
  slug: "small" | "medium" | "large" | "xl";
  name: string;
  credits: number;
  amount_cents: number;
  badge: string | null;
}

export interface Purchase {
  id: string;
  pack_slug: string;
  credits_purchased: number;
  amount_cents: number;
  status: "pending" | "completed" | "failed" | "refunded";
  created_at: string;
  completed_at: string | null;
}

function CreditsContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [history, setHistory] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topupResult = searchParams.get("topup");

  useEffect(() => {
    Promise.all([
      apiFetch("/settings/agent-status").then((r) => r.json()),
      apiFetch("/billing/topup/packs").then((r) => r.json()),
      apiFetch("/billing/topup/history").then((r) => r.ok ? r.json() : { purchases: [] }),
    ])
      .then(([st, pk, hist]) => {
        setStatus(st);
        setPacks(pk.packs || []);
        setHistory(hist.purchases || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleBuy(packSlug: string) {
    setBuying(packSlug);
    setError(null);
    const res = await apiFetch("/billing/topup/checkout", {
      method: "POST",
      body: JSON.stringify({ pack_slug: packSlug }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.detail || "Errore durante l'apertura del pagamento.");
      setBuying(null);
      return;
    }
    window.location.href = body.checkout_url;
  }

  if (loading) {
    return <div className="animate-pulse rounded-card bg-brand-navy-light p-8 text-slate-500">Caricamento...</div>;
  }

  const isByok = status?.has_byok === true;
  const isFree = status?.plan_slug === "free" || !status?.plan_slug;

  return (
    <div className="space-y-6">
      {topupResult === "success" && (
        <div className="rounded-card border border-emerald-500/30 bg-emerald-500/10 p-4 text-[13px] text-emerald-300">
          Ricarica completata! I crediti verranno accreditati entro pochi secondi.
        </div>
      )}
      {topupResult === "cancelled" && (
        <div className="rounded-card border border-slate-700 bg-brand-navy-light p-4 text-[13px] text-slate-300">
          Pagamento annullato. Nessun addebito.
        </div>
      )}
      {error && (
        <div className="rounded-card border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-300">
          {error}
        </div>
      )}

      {/* Card saldo hero */}
      <CreditsBalanceCard status={status} />

      {/* Ricarica — nascosta per BYOK e Free */}
      {!isByok && !isFree && (
        <div>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-100">Ricarica ora</h2>
              <p className="mt-0.5 text-[12px] text-slate-400">
                Scegli un pacchetto. I crediti restano disponibili per 12 mesi dall&apos;acquisto.
              </p>
            </div>
          </div>
          <TopupPackGrid packs={packs} onBuy={handleBuy} loading={buying} />
        </div>
      )}

      {isByok && (
        <div className="rounded-card border border-brand-teal/30 bg-brand-teal/5 p-4 text-[13px] text-brand-teal">
          Stai usando la tua API key Claude — i top-up non sono necessari.
          Paghi direttamente Anthropic per il consumo effettivo.
        </div>
      )}

      {isFree && !isByok && (
        <div className="rounded-card border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] text-amber-300">
          Per acquistare crediti aggiuntivi devi prima scegliere un piano pagante.
          <a href="/settings/billing" className="ml-2 font-semibold underline">Vai ai piani</a>
        </div>
      )}

      {/* Breakdown consumo mensile */}
      {!isByok && !isFree && <UsageBreakdown />}

      {/* Storico acquisti */}
      {history.length > 0 && <PurchaseHistory history={history} />}

      {/* FAQ */}
      <CreditsFAQ />
    </div>
  );
}

export function CreditsClient() {
  return (
    <Suspense fallback={<div className="animate-pulse rounded-card bg-brand-navy-light p-8 text-slate-500">Caricamento...</div>}>
      <CreditsContent />
    </Suspense>
  );
}
