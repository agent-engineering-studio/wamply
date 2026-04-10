"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 6) {
      setError("La password deve avere almeno 6 caratteri.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      setError("Errore nella registrazione. Riprova.");
      setLoading(false);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-ink-05">
        <div className="w-full max-w-sm text-center">
          <div className="rounded-xl border border-brand-ink-10 bg-white p-8 shadow-card">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-green-light">
              <svg viewBox="0 0 24 24" fill="none" stroke="#128C7E" strokeWidth="2.5" className="h-6 w-6">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-brand-ink">Registrazione completata!</h2>
            <p className="mt-2 text-sm text-brand-ink-60">
              Controlla la tua email per confermare l&apos;account.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block rounded-sm bg-brand-green px-6 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
            >
              Vai al login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-ink-05">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-brand-ink">
            Wam<span className="text-brand-green">ply</span>
          </h1>
          <p className="mt-2 text-sm text-brand-ink-60">Crea il tuo account</p>
        </div>

        <div className="rounded-xl border border-brand-ink-10 bg-white p-6 shadow-card">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">Nome completo</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Mario Rossi"
                className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@azienda.it"
                className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 6 caratteri"
                className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-sm bg-brand-green py-2.5 text-[13px] font-medium text-white shadow-[0_2px_8px_rgba(37,211,102,.3)] hover:bg-brand-green-dark disabled:opacity-50"
            >
              {loading ? "Registrazione..." : "Crea account"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[12px] text-brand-ink-60">
          Hai già un account?{" "}
          <Link href="/login" className="font-medium text-brand-green-dark hover:underline">
            Accedi
          </Link>
        </p>
      </div>
    </div>
  );
}
