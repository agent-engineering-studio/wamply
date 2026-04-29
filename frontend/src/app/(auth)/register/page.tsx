import { Suspense } from "react";
import { RegisterForm } from "./RegisterForm";

// Server Component boundary so RegisterForm's `useSearchParams` lives inside
// a <Suspense>. Without this, `next build` fails the prerender step with
// "useSearchParams() should be wrapped in a suspense boundary".
export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-brand-ink-05">
          <div className="text-sm text-brand-ink-60">Caricamento...</div>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
