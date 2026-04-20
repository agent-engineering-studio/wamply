"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const code = (error as { code?: string; status?: number }).code;
      const status = (error as { code?: string; status?: number }).status;
      // GoTrue returns 500 unexpected_failure when a banned user tries to sign in
      // and the same code on the /user endpoint with a valid-but-banned access token.
      if (status === 500 || code === "unexpected_failure" || code === "user_banned") {
        setError("Il tuo account è stato disabilitato. Contatta l'amministratore.");
      } else {
        setError("Email o password non corretti.");
      }
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user && !user.email_confirmed_at) {
      router.push("/confirm-email");
      router.refresh();
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/callback` },
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-ink-05">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2 transition-opacity hover:opacity-80">
            <svg viewBox="0 0 400 400" className="h-9 w-9">
              <defs><linearGradient id="loginLogoBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1B2A4A" /><stop offset="100%" stopColor="#0F1B33" /></linearGradient></defs>
              <rect width="400" height="400" rx="80" fill="url(#loginLogoBg)" />
              <path d="M90 140 L130 290 L170 190 L200 290 L230 190 L270 290 L310 140" fill="none" stroke="#fff" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M90 140 L130 290 L170 190 L200 290 L230 190 L270 290 L310 140" fill="none" stroke="#0D9488" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              <circle cx="320" cy="132" r="8" fill="#0D9488" opacity="0.9" />
              <circle cx="336" cy="120" r="5" fill="#0D9488" opacity="0.6" />
            </svg>
            <span className="text-2xl font-semibold text-brand-ink">Wam<span className="text-brand-teal">ply</span></span>
          </Link>
          <p className="mt-2 text-sm text-brand-ink-60">Accedi al tuo account</p>
        </div>

        <div className="rounded-xl border border-brand-ink-10 bg-white p-6 shadow-card">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="••••••••"
                className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-pill bg-brand-teal py-2.5 text-[13px] font-medium text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
            >
              {loading ? "Accesso in corso..." : "Accedi"}
            </button>
          </form>

          {googleEnabled && (
            <>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-brand-ink-10" />
                <span className="text-[11px] text-brand-ink-30">oppure</span>
                <div className="h-px flex-1 bg-brand-ink-10" />
              </div>

              <button
                onClick={handleGoogleLogin}
                className="w-full rounded-pill border border-brand-ink-10 bg-white py-2.5 text-[13px] font-medium text-brand-ink-60 hover:bg-brand-ink-05"
              >
                Continua con Google
              </button>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[12px] text-brand-ink-60">
          Non hai un account?{" "}
          <Link href="/register" className="font-medium text-brand-teal-dark hover:underline">
            Registrati
          </Link>
        </p>
      </div>
    </div>
  );
}
