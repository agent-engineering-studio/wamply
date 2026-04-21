"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { scorePassword, type PasswordScore } from "@/lib/password-strength";
import { PasswordStrengthMeter } from "../_components/PasswordStrengthMeter";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strength, setStrength] = useState<PasswordScore | null>(null);

  useEffect(() => {
    if (!password) {
      setStrength(null);
      return;
    }
    let active = true;
    const t = setTimeout(() => {
      scorePassword(password, [fullName, email].filter(Boolean))
        .then((s) => {
          if (active) setStrength(s);
        })
        .catch(() => {
          if (active) setStrength(null);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [password, fullName, email]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 10) {
      setError("La password deve avere almeno 10 caratteri.");
      setLoading(false);
      return;
    }
    if (!strength || strength.score < 3) {
      setError("La password non è sufficientemente robusta. Scegline una più forte.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/callback`,
      },
    });

    if (error) {
      setError("Errore nella registrazione. Riprova.");
      setLoading(false);
      return;
    }

    router.push(`/confirm-email?email=${encodeURIComponent(email)}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-ink-05">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2 transition-opacity hover:opacity-80">
            <svg viewBox="0 0 400 400" className="h-9 w-9">
              <defs><linearGradient id="regLogoBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1B2A4A" /><stop offset="100%" stopColor="#0F1B33" /></linearGradient></defs>
              <rect width="400" height="400" rx="80" fill="url(#regLogoBg)" />
              <path d="M90 140 L130 290 L170 190 L200 290 L230 190 L270 290 L310 140" fill="none" stroke="#fff" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M90 140 L130 290 L170 190 L200 290 L230 190 L270 290 L310 140" fill="none" stroke="#0D9488" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              <circle cx="320" cy="132" r="8" fill="#0D9488" opacity="0.9" />
              <circle cx="336" cy="120" r="5" fill="#0D9488" opacity="0.6" />
            </svg>
            <span className="text-2xl font-semibold text-brand-ink">Wam<span className="text-brand-teal">ply</span></span>
          </Link>
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
                className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
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
                className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Almeno 10 caratteri"
                className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
                required
              />
              <PasswordStrengthMeter password={password} score={strength} />
            </div>
            <button
              type="submit"
              disabled={loading || password.length < 10 || (strength?.score ?? 0) < 3}
              className="w-full rounded-pill bg-brand-teal py-2.5 text-[13px] font-medium text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
            >
              {loading ? "Registrazione..." : "Crea account"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[12px] text-brand-ink-60">
          Hai già un account?{" "}
          <Link href="/login" className="font-medium text-brand-teal-dark hover:underline">
            Accedi
          </Link>
        </p>
      </div>
    </div>
  );
}
