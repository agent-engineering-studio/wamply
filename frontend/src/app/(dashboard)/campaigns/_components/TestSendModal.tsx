"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Props {
  open: boolean;
  campaignId: string;
  onClose: () => void;
}

interface TwilioResult {
  sid: string;
  status: string;
  error_code: number | null;
  error_message: string | null;
  to: string;
  from_: string;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "In coda",
  accepted: "Accettato",
  scheduled: "Schedulato",
  sending: "Invio in corso",
  sent: "Inviato al carrier",
  delivered: "Consegnato",
  read: "Letto",
  failed: "Fallito",
  undelivered: "Non consegnato",
};

const STATUS_COLOR: Record<string, string> = {
  queued: "text-amber-300",
  accepted: "text-amber-300",
  scheduled: "text-amber-300",
  sending: "text-amber-300",
  sent: "text-sky-300",
  delivered: "text-emerald-300",
  read: "text-emerald-300",
  failed: "text-rose-300",
  undelivered: "text-rose-300",
};

const TERMINAL = new Set(["delivered", "read", "failed", "undelivered"]);

export function TestSendModal({ open, campaignId, onClose }: Props) {
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TwilioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    if (!result || TERMINAL.has(result.status)) {
      stopPolling();
      return;
    }
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const r = await apiFetch(`/campaigns/${campaignId}/test-send/${result.sid}/status`);
        if (!r.ok) return;
        const data = await r.json();
        setResult((prev) => prev ? { ...prev, ...data } : prev);
      } catch {
        // ignore poll errors
      }
    }, 3000);
    return stopPolling;
  }, [result?.status, result?.sid, campaignId]);

  useEffect(() => {
    if (!open) stopPolling();
  }, [open]);

  function handleClose() {
    stopPolling();
    setTo("");
    setResult(null);
    setError(null);
    onClose();
  }

  async function handleSend() {
    if (!to.trim()) { setError("Inserisci un numero destinatario."); return; }
    setSending(true);
    setError(null);
    try {
      const phone = to.trim().startsWith("whatsapp:") ? to.trim() : `whatsapp:${to.trim()}`;
      const r = await apiFetch(`/campaigns/${campaignId}/test-send`, {
        method: "POST",
        body: JSON.stringify({ to: phone }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      const data: TwilioResult = await r.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore invio test.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  const isTerminal = result ? TERMINAL.has(result.status) : false;
  const isFailed = result ? ["failed", "undelivered"].includes(result.status) : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-card">
        <h2 className="mb-1 text-[15px] font-semibold text-slate-100">Invia messaggio di test</h2>
        <p className="mb-4 text-[12px] text-slate-400">
          Invia un singolo messaggio al numero indicato per verificare il template prima del lancio.
        </p>

        {!result && (
          <>
            {error && (
              <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                {error}
              </div>
            )}
            <label htmlFor="ts-to" className="mb-1 block text-[11.5px] font-medium text-slate-400">
              Numero destinatario
            </label>
            <input
              id="ts-to"
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+39 333 1234567"
              className="mb-4 w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={handleClose}
                className="rounded-pill border border-slate-700 px-4 py-2 text-[12.5px] font-medium text-slate-300 hover:border-slate-600">
                Annulla
              </button>
              <button type="button" onClick={handleSend} disabled={sending}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50">
                {sending ? "Invio…" : "Invia test"}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className={`rounded-sm border px-4 py-3 text-[13px] ${isFailed ? "border-rose-500/30 bg-rose-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
              <div className="flex items-center justify-between">
                <strong className={isFailed ? "text-rose-300" : "text-emerald-300"}>
                  {isFailed ? "Invio fallito" : "Messaggio inviato"}
                </strong>
                <span className={`text-[12px] font-semibold ${STATUS_COLOR[result.status] ?? "text-slate-400"}`}>
                  {STATUS_LABEL[result.status] ?? result.status}
                  {!isTerminal && <span className="ml-1 animate-pulse">…</span>}
                </span>
              </div>

              {result.error_code && (
                <p className="mt-2 text-[11px] text-rose-300">
                  Errore Twilio {result.error_code}: {result.error_message}
                </p>
              )}

              <div className="mt-2 space-y-0.5 font-mono text-[10.5px] text-slate-500">
                <p>SID: {result.sid}</p>
                <p>A: {result.to} · Da: {result.from_}</p>
              </div>

              {!isTerminal && (
                <p className="mt-2 text-[11px] text-slate-500">Aggiornamento stato automatico ogni 3s…</p>
              )}
            </div>

            {isTerminal && (
              <div className="flex justify-end">
                <button type="button" onClick={handleClose}
                  className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark">
                  Chiudi
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
