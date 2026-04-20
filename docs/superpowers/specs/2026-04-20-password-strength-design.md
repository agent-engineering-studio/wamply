# Password Strength — Design Doc

**Date:** 2026-04-20
**Status:** Approved for implementation
**Scope:** Feature A of three sub-projects (password strength → admin plan management → user billing view).

## Goal

Enforce strong passwords at registration with live feedback. The `/register` page shows a strength meter under the password field (powered by zxcvbn) plus actionable feedback in Italian, and blocks submit until the password reaches acceptable strength. GoTrue enforces a minimum length server-side as a defense-in-depth guard.

## Context

`frontend/src/app/(auth)/register/page.tsx` today validates only `password.length >= 6`. No visual feedback, no entropy check. A user can register with `password123` or their own email as password.

Login page stays unchanged (existing accounts do not need to meet the new policy to log in).

## Non-goals

- Password reset / change flow (separate page, separate design).
- Breached-password check (Have I Been Pwned) — extra network dependency, deferred.
- Show/hide password toggle — not requested.
- Re-applying the same rules to already-registered users.
- Rate-limit / captcha on registration — separate concern.

## Strength library

Use **`@zxcvbn-ts/core`** with the Italian language pack:

- `@zxcvbn-ts/core` — core scoring engine (~43 KB min)
- `@zxcvbn-ts/language-common` — language-agnostic dictionaries (~40 KB, frequent passwords, surnames)
- `@zxcvbn-ts/language-it` — Italian dictionaries + translated feedback strings

Both dictionaries and the core are **dynamically imported** at first use inside `/register` so the cost is not paid on other pages.

Initial configuration happens once inside the helper, then each call returns a plain result object.

## Components

### New — `frontend/src/lib/password-strength.ts`

Pure async helper exposing a single function:

```typescript
export interface PasswordScore {
  score: 0 | 1 | 2 | 3 | 4;
  warning: string;     // already localized, empty string if none
  suggestions: string[]; // already localized, empty array if none
}

export async function scorePassword(
  password: string,
  userInputs?: string[]
): Promise<PasswordScore>;
```

On first call the module dynamically imports the three `@zxcvbn-ts/*` packages, builds an options object, calls `zxcvbnOptions.setOptions({ dictionary, translations, graphs })`, and caches a ready flag so subsequent calls only run `zxcvbn(password, userInputs)`. `userInputs` should include the user's full name and email — zxcvbn then penalizes passwords that contain/reuse those strings.

### New — `frontend/src/app/(auth)/_components/PasswordStrengthMeter.tsx`

Presentational component. Props: `{ password: string, score: PasswordScore | null }`.

Renders:
- **Segmented bar**: 4 horizontal segments (for scores 1–4). Colored progressively from red (1) to green (4). Segments beyond the current score are muted (`bg-brand-navy-deep`).
- **Label** next to the bar: "Molto debole" (0) / "Debole" (1) / "Accettabile" (2) / "Buona" (3) / "Eccellente" (4).
- Below the bar, when `score.warning` is non-empty: a small red caption.
- Below the warning (or in its place), up to **2 suggestions** from `score.suggestions`, shown as small bullet-style lines in muted text.
- The whole block is wrapped in `<div role="status" aria-live="polite">` so screen readers hear changes. The bar itself has `role="progressbar"`, `aria-valuemin={0}`, `aria-valuemax={4}`, `aria-valuenow={score?.score ?? 0}`, `aria-label="Robustezza password"`.

Hidden entirely when `password.length === 0`.

### Modified — `frontend/src/app/(auth)/register/page.tsx`

- New state: `strength: PasswordScore | null`.
- `useEffect` keyed on `password`/`fullName`/`email` debounced by 200 ms. Calls `scorePassword(password, [fullName, email].filter(Boolean))` and stores the result in `strength`. Cancels in-flight evaluations if the password changes again (simple `active` flag in the effect).
- Submit handler validations (replace the existing length-6 check):
  1. `password.length < 10` → set error "La password deve avere almeno 10 caratteri." and stop.
  2. `!strength || strength.score < 3` → set error "La password non è sufficientemente robusta. Scegline una più forte." and stop.
- Password `<input>` placeholder becomes "Almeno 10 caratteri".
- `<PasswordStrengthMeter>` is rendered right below the password `<input>`.
- Submit button becomes `disabled={loading || password.length < 10 || (strength?.score ?? 0) < 3}`.

### Modified — `docker-compose.yml`

In the `supabase-auth` service environment, add (or update if present):

```yaml
GOTRUE_PASSWORD_MIN_LENGTH: 10
```

This is the only server-side change. GoTrue rejects shorter passwords with a `422` response that the client already catches in the existing `try/catch`.

## Data flow

```
user types in password input
  → onChange updates local state
  → useEffect (debounced 200 ms) calls scorePassword(password, [fullName, email])
    → first call: dynamic import of zxcvbn-ts (core + language packs), options setup
    → zxcvbn(password, userInputs) returns {score, feedback}
    → helper maps feedback to { score, warning, suggestions } shape
  → setStrength(result)
  → PasswordStrengthMeter rerenders with new score
  → submit handler uses latest strength before calling supabase.auth.signUp
```

## Validation rules summary

| Layer | Rule | Error surface |
|---|---|---|
| Client | `password.length >= 10` | inline error, button disabled |
| Client | `zxcvbn score >= 3` | inline error, button disabled |
| Server | `GOTRUE_PASSWORD_MIN_LENGTH=10` | existing supabase error banner |

## Accessibility

- The meter's `role="progressbar"` with `aria-valuenow` is announced on focus.
- The `role="status"` `aria-live="polite"` wrapper announces suggestions when they change, without interrupting the user.
- Labels are visible text, not color alone — color indicates strength but the textual label is always present.
- Error messages under the field use the existing red banner at the top of the form.

## Out of scope

As listed under Non-goals above.

## Success criteria

1. `/register` with password `"password123"`: bar is red/orange, warning "Questa è una password troppo comune." appears, submit button disabled.
2. Password equal to the user's full name ("Mario Rossi"): zxcvbn score drops to 0–1 due to `userInputs` matching.
3. Password `"Tramonto-Verde-42!"` (high entropy, not in dictionaries): score 4, bar green, submit enabled.
4. Typing a 9-character password: inline error "La password deve avere almeno 10 caratteri.", submit disabled.
5. Curl-bypass with an 8-char password hits GoTrue and is rejected with 422; client-side error banner shows a readable message.
6. Client-side evaluation stays under ~50 ms per keystroke after the first import (measured in DevTools Performance).
7. `/register` bundle size after change: zxcvbn-ts chunks loaded only when the page is visited (confirmed via DevTools Network tab).
