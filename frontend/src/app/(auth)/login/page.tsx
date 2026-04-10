"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Email o password non corretti.");
      setLoading(false);
      return;
    }

    router.push("/");
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
          <h1 className="text-2xl font-semibold text-brand-ink">
            Wam<span className="text-brand-green">ply</span>
          </h1>
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
                placeholder="••••••••"
                className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-sm bg-brand-green py-2.5 text-[13px] font-medium text-white shadow-[0_2px_8px_rgba(37,211,102,.3)] hover:bg-brand-green-dark disabled:opacity-50"
            >
              {loading ? "Accesso in corso..." : "Accedi"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-brand-ink-10" />
            <span className="text-[11px] text-brand-ink-30">oppure</span>
            <div className="h-px flex-1 bg-brand-ink-10" />
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full rounded-sm border border-brand-ink-10 bg-white py-2.5 text-[13px] font-medium text-brand-ink-60 hover:bg-brand-ink-05"
          >
            Continua con Google
          </button>
        </div>

        <p className="mt-4 text-center text-[12px] text-brand-ink-60">
          Non hai un account?{" "}
          <Link href="/register" className="font-medium text-brand-green-dark hover:underline">
            Registrati
          </Link>
        </p>
      </div>
    </div>
  );
}
