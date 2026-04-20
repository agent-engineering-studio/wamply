# Password Strength Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a zxcvbn-powered password strength meter on `/register` with live Italian feedback and set `GOTRUE_PASSWORD_MIN_LENGTH=10` server-side as a guard.

**Architecture:** Client-side strength scoring via `@zxcvbn-ts/core` + Italian language pack, dynamically imported inside a lazy helper so the cost is paid only on `/register`. A presentational `PasswordStrengthMeter` renders a 4-segment bar with label/warning/suggestions. GoTrue env var enforces min length server-side.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4 (light theme for auth pages per project convention), `@zxcvbn-ts/core` + `@zxcvbn-ts/language-common` + `@zxcvbn-ts/language-it`, GoTrue (Supabase Auth).

---

## File Structure

**New files:**
- `frontend/src/lib/password-strength.ts` — async `scorePassword(password, userInputs)` helper with lazy zxcvbn-ts init
- `frontend/src/app/(auth)/_components/PasswordStrengthMeter.tsx` — presentational bar + feedback

**Modified files:**
- `frontend/package.json` — add zxcvbn-ts deps
- `frontend/src/app/(auth)/register/page.tsx` — integrate meter + new validations
- `docker-compose.yml` — `GOTRUE_PASSWORD_MIN_LENGTH: 10`

---

## Task 1: Add zxcvbn-ts dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install packages inside the container**

The frontend runs in a Docker container with a mounted `node_modules` volume. Install from the host by running npm inside the container so the volume gets the new packages:

```bash
docker compose exec frontend npm install @zxcvbn-ts/core@^3.0.4 @zxcvbn-ts/language-common@^3.0.4 @zxcvbn-ts/language-it@^3.1.2
```

Expected: `package.json` and `package-lock.json` are updated, install exits 0.

- [ ] **Step 2: Verify the three deps landed in `package.json`**

Open `frontend/package.json` and confirm `dependencies` now contains (order doesn't matter, versions may be `^3.x.y`):

```json
"@zxcvbn-ts/core": "^3.x.y",
"@zxcvbn-ts/language-common": "^3.x.y",
"@zxcvbn-ts/language-it": "^3.x.y"
```

- [ ] **Step 3: Commit**

From `c:\Users\GiuseppeZileni\Git\wamply`:

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(deps): add @zxcvbn-ts/{core,language-common,language-it}"
```

---

## Task 2: Password strength helper

**Files:**
- Create: `frontend/src/lib/password-strength.ts`

- [ ] **Step 1: Write the helper module**

Create `frontend/src/lib/password-strength.ts` with this exact content:

```typescript
export interface PasswordScore {
  score: 0 | 1 | 2 | 3 | 4;
  warning: string;
  suggestions: string[];
}

let ready: Promise<(password: string, userInputs?: string[]) => PasswordScore> | null = null;

async function getScorer(): Promise<(password: string, userInputs?: string[]) => PasswordScore> {
  const [core, common, it] = await Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-it"),
  ]);

  core.zxcvbnOptions.setOptions({
    translations: it.translations,
    graphs: common.adjacencyGraphs,
    dictionary: {
      ...common.dictionary,
      ...it.dictionary,
    },
  });

  return (password: string, userInputs: string[] = []) => {
    const result = core.zxcvbn(password, userInputs);
    return {
      score: result.score,
      warning: result.feedback.warning ?? "",
      suggestions: result.feedback.suggestions ?? [],
    };
  };
}

export async function scorePassword(
  password: string,
  userInputs: string[] = []
): Promise<PasswordScore> {
  if (!ready) ready = getScorer();
  const scorer = await ready;
  return scorer(password, userInputs);
}
```

- [ ] **Step 2: Typecheck**

From `c:\Users\GiuseppeZileni\Git\wamply`:

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "password-strength" | head -5
```

Expected: no output. If you see module-not-found errors, re-run `docker compose exec frontend npm install` (Task 1) to populate the volume.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/password-strength.ts
git commit -m "feat(auth): add lazy zxcvbn-based password strength helper"
```

---

## Task 3: PasswordStrengthMeter component

**Files:**
- Create: `frontend/src/app/(auth)/_components/PasswordStrengthMeter.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/app/(auth)/_components/PasswordStrengthMeter.tsx` with this exact content:

```tsx
"use client";

import type { PasswordScore } from "@/lib/password-strength";

const LABELS = ["Molto debole", "Debole", "Accettabile", "Buona", "Eccellente"] as const;
const BAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-600",
] as const;

export function PasswordStrengthMeter({
  password,
  score,
}: {
  password: string;
  score: PasswordScore | null;
}) {
  if (password.length === 0) return null;

  const s = score?.score ?? 0;
  const label = LABELS[s];
  const warning = score?.warning ?? "";
  const suggestions = score?.suggestions ?? [];

  return (
    <div role="status" aria-live="polite" className="mt-2">
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label="Robustezza password"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={s}
          className="flex flex-1 gap-1"
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                s >= i ? BAR_COLORS[s] : "bg-brand-ink-10"
              }`}
            />
          ))}
        </div>
        <span className="text-[11px] font-medium text-brand-ink-60">{label}</span>
      </div>

      {warning && (
        <p className="mt-1 text-[11px] text-red-600">{warning}</p>
      )}
      {suggestions.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {suggestions.slice(0, 2).map((tip, i) => (
            <li key={i} className="text-[11px] text-brand-ink-60">
              · {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "PasswordStrengthMeter" | head -5
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(auth)/_components/PasswordStrengthMeter.tsx"
git commit -m "feat(auth): add password strength meter component"
```

---

## Task 4: Integrate meter into register page

**Files:**
- Modify: `frontend/src/app/(auth)/register/page.tsx`

- [ ] **Step 1: Add imports**

At the top of `frontend/src/app/(auth)/register/page.tsx`, after the existing imports (after `import { createClient } from "@/lib/supabase/client";`), add:

```tsx
import { useEffect } from "react";
import { scorePassword, type PasswordScore } from "@/lib/password-strength";
import { PasswordStrengthMeter } from "../_components/PasswordStrengthMeter";
```

The existing first import line currently reads `import { useState } from "react";` — replace it with:

```tsx
import { useState, useEffect } from "react";
```

Do NOT add a separate second `useEffect` import line.

- [ ] **Step 2: Add strength state and debounced evaluation**

Inside the `RegisterPage` component, right after the `error` state declaration (`const [error, setError] = useState<string | null>(null);`), add:

```tsx
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
```

- [ ] **Step 3: Replace the submit validation**

Find the block inside `handleSubmit`:

```tsx
    if (password.length < 6) {
      setError("La password deve avere almeno 6 caratteri.");
      setLoading(false);
      return;
    }
```

Replace it with:

```tsx
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
```

- [ ] **Step 4: Update the password input placeholder and add the meter**

Find the block inside the JSX:

```tsx
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 6 caratteri"
                className="w-full rounded-sm border border-brand-ink-10 px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
                required
              />
            </div>
```

Replace it with:

```tsx
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
```

- [ ] **Step 5: Disable submit until the policy is met**

Find the submit button block:

```tsx
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-pill bg-brand-teal py-2.5 text-[13px] font-medium text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
            >
              {loading ? "Registrazione..." : "Crea account"}
            </button>
```

Replace the `disabled={loading}` attribute only — keep the rest intact:

```tsx
            <button
              type="submit"
              disabled={loading || password.length < 10 || (strength?.score ?? 0) < 3}
              className="w-full rounded-pill bg-brand-teal py-2.5 text-[13px] font-medium text-white shadow-teal hover:bg-brand-teal-dark disabled:opacity-50"
            >
              {loading ? "Registrazione..." : "Crea account"}
            </button>
```

- [ ] **Step 6: Typecheck**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "register/page" | head -5
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add "frontend/src/app/(auth)/register/page.tsx"
git commit -m "feat(auth): integrate strength meter and raise min length to 10 on /register"
```

---

## Task 5: Server-side guard

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add the env variable**

Open `docker-compose.yml`. Find the `supabase-auth` service `environment` block. Locate the existing `GOTRUE_DISABLE_SIGNUP: "false"` line.

Insert a new line immediately after it:

```yaml
      GOTRUE_PASSWORD_MIN_LENGTH: 10
```

(Indent with 6 spaces — same as the surrounding `GOTRUE_*` keys.)

- [ ] **Step 2: Apply the change**

```bash
docker compose up -d supabase-auth
```

Expected: container recreated.

- [ ] **Step 3: Verify the setting reached GoTrue**

```bash
docker compose exec supabase-auth env | grep GOTRUE_PASSWORD_MIN_LENGTH
```

Expected output:

```
GOTRUE_PASSWORD_MIN_LENGTH=10
```

- [ ] **Step 4: Server-side behavior smoke test**

With Kong up (`docker ps | grep wcm-supabase-kong`) run:

```bash
curl -s -X POST "http://localhost:8100/auth/v1/signup" \
  -H "Content-Type: application/json" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -d '{"email":"smoke-short@test.local","password":"short"}' \
  -w "\nHTTP %{http_code}\n"
```

Expected: `HTTP 422` with a body like `{"code":422,"error_code":"weak_password","msg":"Password should be at least 10 characters."}` (the exact `msg` may vary slightly across GoTrue versions).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(auth): enforce min password length 10 in GoTrue"
```

---

## Task 6: End-to-end smoke test

- [ ] **Step 1: Reload the register page in the browser**

1. Visit `http://localhost:3000/register`.
2. Open DevTools → Network and filter for `zxcvbn-ts`. Start with password field empty — nothing should be fetched yet.

- [ ] **Step 2: Weak password scenario**

Type `password123` in the password field.

Expected:
- Network panel shows `@zxcvbn-ts/core`, `@zxcvbn-ts/language-common`, `@zxcvbn-ts/language-it` chunks loaded once.
- Bar: 1 segment red/orange, label "Debole".
- A warning appears in Italian (something like "Questa è una password molto comune").
- "Crea account" button is disabled.

- [ ] **Step 3: Name-as-password scenario**

Clear the password. Fill `Mario Rossi` in the name field, then type `Mario Rossi 123` in the password field.

Expected: score drops to 0–1 because `fullName` is passed to zxcvbn as `userInputs`.

- [ ] **Step 4: Strong password scenario**

Clear the password. Type `Tramonto-Verde-42!` (or any high-entropy 18-char passphrase not in dictionaries).

Expected:
- Bar: all 4 segments green, label "Eccellente" or "Buona".
- No warning, no suggestions (or positive suggestions only).
- "Crea account" button is enabled.

- [ ] **Step 5: Server-side guard scenario**

Open DevTools → Elements → temporarily remove the `disabled` attribute from the submit button by hand. Use a password like `aaaaaaaaa` (9 chars, length fails server-side). Click submit.

Expected: GoTrue returns 422 and the red error banner at the top of the form shows the generic "Errore nella registrazione" message.

- [ ] **Step 6: Final git status check**

```bash
git status
```

Expected: clean working tree. If clean, no further commits needed.

```bash
git log --oneline -8
```

Expected: the 5 commits from tasks 1–5 in order.

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - SC1 (weak password blocked with warning) → Task 4 step 3 + Task 6 step 2
  - SC2 (name-as-password penalized) → Task 4 step 2 (`userInputs` = [fullName, email]) + Task 6 step 3
  - SC3 (strong password accepted) → Task 6 step 4
  - SC4 (length < 10 message) → Task 4 step 3 (length check)
  - SC5 (server-side guard rejects bypass) → Task 5 + Task 6 step 5
  - SC6 (evaluation <50ms after first import) → implicit in architecture (cached scorer); not measured in a dedicated task but covered by SC2/SC3 manual test.
  - SC7 (zxcvbn chunks loaded only on /register) → verified in Task 6 step 1–2 via DevTools Network.
- [x] **Placeholder scan:** no TBD / TODO / "handle edge cases". All code shown in full.
- [x] **Type consistency:** `PasswordScore` interface defined in Task 2; imported with the same name in Task 3 and Task 4. `scorePassword` signature is consistent across all call sites. Tailwind tokens (`bg-brand-ink-10`, `text-brand-ink-60`, `bg-brand-teal`, `text-red-600`) match the current light-theme convention used by `/register` — no dark-theme tokens accidentally introduced into the auth pages.
- [x] **Theme note:** Auth pages are intentionally left in light theme per project convention (dark theme applies only to dashboard routes). The new meter uses compatible tokens.
