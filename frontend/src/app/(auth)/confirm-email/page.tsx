"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ConfirmEmailPage() {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    setResending(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
      setError("Impossibile recuperare l'email. Effettua nuovamente il login.");
      setResending(false);
      return;
    }

    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: user.email,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });

    if (resendError) {
      setError("Errore nell'invio dell'email. Riprova tra qualche minuto.");
    } else {
      setResent(true);
    }
    setResending(false);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-ink-05">
      <div className="w-full max-w-sm text-center">
        <div className="rounded-xl border border-brand-ink-10 bg-white p-8 shadow-card">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" className="h-6 w-6">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <polyline points="2 4 12 13 22 4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-brand-ink">Conferma la tua email</h2>
          <p className="mt-2 text-sm text-brand-ink-60">
            Ti abbiamo inviato un&apos;email di conferma. Clicca sul link nella mail per attivare il tuo account.
          </p>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {resent && (
            <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              Email di conferma inviata nuovamente!
            </div>
          )}

          <button
            onClick={handleResend}
            disabled={resending || resent}
            className="mt-6 w-full rounded-pill bg-brand-teal py-2.5 text-[13px] font-medium text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
          >
            {resending ? "Invio in corso..." : resent ? "Email inviata" : "Reinvia email di conferma"}
          </button>

          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-pill border border-brand-ink-10 bg-white py-2.5 text-[13px] font-medium text-brand-ink-60 hover:bg-brand-ink-05"
          >
            Torna al login
          </button>
        </div>
      </div>
    </div>
  );
}
