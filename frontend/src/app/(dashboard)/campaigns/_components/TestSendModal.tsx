"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Props {
  open: boolean;
  campaignId: string;
  onClose: () => void;
}

export function TestSendModal({ open, campaignId, onClose }: Props) {
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sid: string; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleClose() {
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
      const data = await r.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore invio test.");
    } finally {
      setSending(false);
    }
  }

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
              <button
                type="button"
                onClick={handleClose}
                className="rounded-pill border border-slate-700 px-4 py-2 text-[12.5px] font-medium text-slate-300 hover:border-slate-600"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50"
              >
                {sending ? "Invio…" : "Invia test"}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-300">
              <strong>Messaggio inviato</strong>
              <p className="mt-1 font-mono text-[11px] text-slate-400">SID: {result.sid} · Stato: {result.status}</p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark"
              >
                Chiudi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
