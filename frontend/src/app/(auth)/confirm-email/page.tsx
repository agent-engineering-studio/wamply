"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function ConfirmEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolveEmail(): Promise<string | null> {
    if (emailFromQuery) return emailFromQuery;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email ?? null;
  }

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmed = code.replace(/\s+/g, "");
    if (trimmed.length !== 6) {
      setError("Inserisci il codice a 6 cifre ricevuto via email.");
      return;
    }

    const email = await resolveEmail();
    if (!email) {
      setError("Impossibile recuperare l'email. Registrati di nuovo o effettua il login.");
      return;
    }

    setVerifying(true);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: trimmed,
      type: "signup",
    });

    if (verifyError) {
      setError("Codice non valido o scaduto. Richiedine uno nuovo.");
      setVerifying(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleResend() {
    setResending(true);
    setError(null);

    const email = await resolveEmail();
    if (!email) {
      setError("Impossibile recuperare l'email. Registrati di nuovo o effettua il login.");
      setResending(false);
      return;
    }

    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });

    if (resendError) {
      setError("Errore nell'invio dell'email. Riprova tra qualche minuto.");
    } else {
      setResent(true);
    }
    setResending(false);
  }

  async function handleBackToLogin() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-ink-05">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-brand-ink-10 bg-white p-8 shadow-card">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" className="h-6 w-6">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <polyline points="2 4 12 13 22 4" />
            </svg>
          </div>
          <h2 className="text-center text-lg font-semibold text-brand-ink">Controlla la tua email</h2>
          <p className="mt-2 text-center text-sm text-brand-ink-60">
            {emailFromQuery ? (
              <>
                Abbiamo inviato un codice di conferma a{" "}
                <span className="font-medium text-brand-ink">{emailFromQuery}</span>.
              </>
            ) : (
              <>Ti abbiamo inviato un codice di conferma via email.</>
            )}
          </p>
          <p className="mt-2 text-center text-[11.5px] text-brand-ink-60">
            Se non la trovi, controlla anche nella cartella Spam.
          </p>

          <form onSubmit={handleVerify} className="mt-6">
            <label className="mb-1.5 block text-[11.5px] font-medium text-brand-ink-60">
              Codice a 6 cifre
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full rounded-sm border border-brand-ink-10 px-3 py-2.5 text-center text-[18px] font-semibold tracking-[0.4em] text-brand-ink focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />

            {error && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {resent && !error && (
              <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                Email di conferma inviata nuovamente.
              </div>
            )}

            <button
              type="submit"
              disabled={verifying || code.length !== 6}
              className="mt-4 w-full rounded-pill bg-brand-teal py-2.5 text-[13px] font-medium text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
            >
              {verifying ? "Verifica in corso..." : "Conferma email"}
            </button>
          </form>

          <div className="mt-4 text-center text-[12px] text-brand-ink-60">
            Non hai ricevuto il codice?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="font-medium text-brand-teal-dark hover:underline disabled:opacity-50"
            >
              {resending ? "Invio..." : "Reinvia email"}
            </button>
          </div>

          <button
            onClick={handleBackToLogin}
            className="mt-4 w-full rounded-pill border border-brand-ink-10 bg-white py-2.5 text-[13px] font-medium text-brand-ink-60 hover:bg-brand-ink-05"
          >
            Torna al login
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmEmailContent />
    </Suspense>
  );
}
