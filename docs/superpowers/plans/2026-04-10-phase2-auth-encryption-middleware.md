# Phase 2 — Auth, Encryption, Middleware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add remaining DB migrations (agent_memory, audit_trail, RLS), seed data, initialize the Next.js frontend with TypeScript/Tailwind/shadcn, create Supabase client libraries, AES-256-GCM encryption, API route middleware (auth, plan limits, admin), and plan-aware hooks/components.

**Architecture:** Frontend uses @supabase/ssr for cookie-based auth in Next.js 15 App Router. Route Handlers are wrapped with composable middleware HOFs (withAuth, withPlanLimits, withAdminRole). Plan/usage data is cached in Redis (5min TTL). UI components gate features by plan using a usePlan hook backed by SWR.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Tailwind CSS, shadcn/ui, @supabase/ssr, @supabase/supabase-js, SWR, ioredis, Node.js crypto (AES-256-GCM)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/005_agent_memory.sql` | agent_memory table |
| `supabase/migrations/006_admin_audit.sql` | audit_trail table |
| `supabase/migrations/007_rls_policies.sql` | RLS policies on all tables |
| `supabase/seed.sql` | Admin + 2 test users with plans, contacts, templates, campaigns |
| `frontend/tsconfig.json` | TypeScript strict config |
| `frontend/next.config.ts` | Next.js config |
| `frontend/tailwind.config.ts` | Tailwind with brand colors |
| `frontend/postcss.config.mjs` | PostCSS for Tailwind |
| `frontend/src/app/globals.css` | Tailwind directives + CSS vars |
| `frontend/src/app/layout.tsx` | Root layout (minimal) |
| `frontend/src/app/page.tsx` | Placeholder home page |
| `frontend/src/types/database.ts` | DB row types matching schema |
| `frontend/src/types/plans.ts` | Plan features, limits, usage types |
| `frontend/src/lib/supabase/client.ts` | Browser Supabase client |
| `frontend/src/lib/supabase/server.ts` | Server-side Supabase client (cookies) |
| `frontend/src/lib/supabase/admin.ts` | Service-role admin client |
| `frontend/src/lib/encryption.ts` | AES-256-GCM encrypt/decrypt |
| `frontend/src/lib/redis.ts` | ioredis singleton |
| `frontend/src/middleware.ts` | Next.js middleware (auth token refresh) |
| `frontend/src/middleware/withAuth.ts` | Route Handler auth wrapper |
| `frontend/src/middleware/withPlanLimits.ts` | Route Handler plan limits wrapper |
| `frontend/src/middleware/withAdminRole.ts` | Route Handler admin check wrapper |
| `frontend/src/app/api/me/plan/route.ts` | GET current user plan + usage |
| `frontend/src/hooks/usePlan.ts` | SWR hook for plan data |
| `frontend/src/components/shared/FeatureGate.tsx` | Conditional render by plan feature |
| `frontend/src/components/shared/UpgradePrompt.tsx` | Plan comparison upgrade dialog |

---

### Task 1: Initialize Next.js frontend project

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next.config.ts`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.mjs`
- Create: `frontend/src/app/globals.css`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/page.tsx`
- Modify: `.env.example` (add NEXT_PUBLIC_ prefixed vars)
- Modify: `docker-compose.yml` (add NEXT_PUBLIC_ env vars to frontend)

- [ ] **Step 1: Update frontend/package.json with all Phase 2 dependencies**

```json
{
  "name": "wcm-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest"
  },
  "dependencies": {
    "@supabase/ssr": "^0.6.1",
    "@supabase/supabase-js": "^2.49.4",
    "ioredis": "^5.6.1",
    "next": "^15.3.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "swr": "^2.3.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.4",
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "tailwindcss": "^4.1.4",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create frontend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create frontend/next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create frontend/tailwind.config.ts**

Wamply brand colors: navy (#1B2A4A), teal (#0D9488), slates (#94A3B8, #64748B, #475569).

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: {
            DEFAULT: "#1B2A4A",
            light: "#1B2A4A",
            dark: "#0F1B33",
            darkest: "#0B1628",
          },
          teal: {
            DEFAULT: "#0D9488",
          },
        },
      },
      borderRadius: {
        pill: "1.375rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Create frontend/postcss.config.mjs**

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 6: Create frontend/src/app/globals.css**

```css
@import "tailwindcss";
```

- [ ] **Step 7: Create frontend/src/app/layout.tsx**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wamply — WhatsApp Campaign Manager",
  description: "Amplify your WhatsApp campaigns with AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Create frontend/src/app/page.tsx**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-navy">
      <h1 className="text-4xl font-medium text-white">Wamply</h1>
    </main>
  );
}
```

- [ ] **Step 9: Add NEXT_PUBLIC_ env vars to .env.example**

Append after the existing SUPABASE vars section, add these lines:

```
# ── Next.js Public (client-side) ─────────────────────────
NEXT_PUBLIC_SUPABASE_URL=http://localhost:9999
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

- [ ] **Step 10: Add NEXT_PUBLIC_ env vars to docker-compose.yml frontend service**

Add to the frontend service environment list:

```yaml
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-http://supabase-auth:9999}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY}}
```

- [ ] **Step 11: Run npm install and verify build**

```bash
cd frontend && npm install && npx next build
```

Expected: Build succeeds with zero TypeScript errors.

- [ ] **Step 12: Commit**

```bash
git add frontend/ .env.example docker-compose.yml
git commit -m "feat: initialize Next.js 15 frontend with TypeScript, Tailwind, brand theme"
```

---

### Task 2: Migrations 005, 006, 007

**Files:**
- Create: `supabase/migrations/005_agent_memory.sql`
- Create: `supabase/migrations/006_admin_audit.sql`
- Create: `supabase/migrations/007_rls_policies.sql`

- [ ] **Step 1: Create 005_agent_memory.sql**

```sql
-- 005_agent_memory.sql
-- Agent cross-campaign memory store

CREATE TABLE agent_memory (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    key        text        NOT NULL,
    value      jsonb       NOT NULL DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id, key)
);

CREATE INDEX idx_agent_memory_user_id ON agent_memory (user_id);

CREATE TRIGGER trg_agent_memory_updated_at
    BEFORE UPDATE ON agent_memory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Create 006_admin_audit.sql**

```sql
-- 006_admin_audit.sql
-- Audit trail for admin actions

CREATE TABLE audit_trail (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id   uuid        REFERENCES users(id) ON DELETE SET NULL,
    action          text        NOT NULL,
    target_user_id  uuid        REFERENCES users(id) ON DELETE SET NULL,
    details         jsonb       DEFAULT '{}',
    ip_address      inet,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_trail_admin ON audit_trail (admin_user_id);
CREATE INDEX idx_audit_trail_target ON audit_trail (target_user_id);
CREATE INDEX idx_audit_trail_created ON audit_trail (created_at DESC);
```

- [ ] **Step 3: Create 007_rls_policies.sql**

```sql
-- 007_rls_policies.sql
-- Row Level Security on all tables

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

-- ── Users ────────────────────────────────────────────────
CREATE POLICY users_select_own ON users
    FOR SELECT USING (id = auth.uid());
CREATE POLICY users_update_own ON users
    FOR UPDATE USING (id = auth.uid());
CREATE POLICY users_admin_all ON users
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

-- ── WhatsApp Config ──────────────────────────────────────
CREATE POLICY whatsapp_config_own ON whatsapp_config
    FOR ALL USING (user_id = auth.uid());

-- ── AI Config ────────────────────────────────────────────
CREATE POLICY ai_config_own ON ai_config
    FOR ALL USING (user_id = auth.uid());

-- ── Contacts ─────────────────────────────────────────────
CREATE POLICY contacts_own ON contacts
    FOR ALL USING (user_id = auth.uid());

-- ── Templates ────────────────────────────────────────────
CREATE POLICY templates_own ON templates
    FOR ALL USING (user_id = auth.uid());

-- ── Campaigns ────────────────────────────────────────────
CREATE POLICY campaigns_own ON campaigns
    FOR ALL USING (user_id = auth.uid());

-- ── Messages (via campaign ownership) ────────────────────
CREATE POLICY messages_own ON messages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM campaigns c
            WHERE c.id = messages.campaign_id AND c.user_id = auth.uid()
        )
    );

-- ── Plans (readable by all authenticated) ────────────────
CREATE POLICY plans_select_all ON plans
    FOR SELECT USING (true);

-- ── Subscriptions ────────────────────────────────────────
CREATE POLICY subscriptions_own ON subscriptions
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY subscriptions_admin ON subscriptions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

-- ── Usage Counters ───────────────────────────────────────
CREATE POLICY usage_counters_own ON usage_counters
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY usage_counters_admin ON usage_counters
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

-- ── Agent Memory ─────────────────────────────────────────
CREATE POLICY agent_memory_own ON agent_memory
    FOR ALL USING (user_id = auth.uid());

-- ── Audit Trail (admin only) ─────────────────────────────
CREATE POLICY audit_trail_admin ON audit_trail
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

-- ── Service role bypass ──────────────────────────────────
-- The service_role key bypasses RLS by default in Supabase.
-- No explicit policy needed for service_role access.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/005_agent_memory.sql supabase/migrations/006_admin_audit.sql supabase/migrations/007_rls_policies.sql
git commit -m "feat: add migrations 005-007 — agent_memory, audit_trail, RLS policies"
```

---

### Task 3: Seed data

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Create supabase/seed.sql**

```sql
-- seed.sql
-- Development seed data: 1 admin + 2 test users with subscriptions, contacts, templates, campaigns
-- Run with: make seed

-- ── Admin user ───────────────────────────────────────────
INSERT INTO users (id, email, role, full_name)
VALUES ('a0000000-0000-0000-0000-000000000001', 'admin@wcm.local', 'admin', 'Admin WCM')
ON CONFLICT (email) DO NOTHING;

-- ── Test User 1 (Starter plan) ───────────────────────────
INSERT INTO users (id, email, role, full_name)
VALUES ('b0000000-0000-0000-0000-000000000001', 'user1@test.local', 'user', 'Marco Rossi')
ON CONFLICT (email) DO NOTHING;

-- ── Test User 2 (Professional plan) ──────────────────────
INSERT INTO users (id, email, role, full_name)
VALUES ('c0000000-0000-0000-0000-000000000001', 'user2@test.local', 'user', 'Giulia Bianchi')
ON CONFLICT (email) DO NOTHING;

-- ── Subscriptions ────────────────────────────────────────
INSERT INTO subscriptions (user_id, plan_id)
SELECT 'a0000000-0000-0000-0000-000000000001', id FROM plans WHERE slug = 'enterprise'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO subscriptions (user_id, plan_id)
SELECT 'b0000000-0000-0000-0000-000000000001', id FROM plans WHERE slug = 'starter'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO subscriptions (user_id, plan_id)
SELECT 'c0000000-0000-0000-0000-000000000001', id FROM plans WHERE slug = 'professional'
ON CONFLICT (user_id) DO NOTHING;

-- ── Usage counters ───────────────────────────────────────
INSERT INTO usage_counters (user_id, period_start, campaigns_used, messages_used, contacts_count)
VALUES
  ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 1, 45, 50),
  ('c0000000-0000-0000-0000-000000000001', CURRENT_DATE, 3, 580, 200)
ON CONFLICT (user_id, period_start) DO NOTHING;

-- ── Contacts for User 1 (50 contacts) ───────────────────
INSERT INTO contacts (user_id, phone, name, tags, opt_in, opt_in_date)
SELECT
  'b0000000-0000-0000-0000-000000000001',
  '+3933' || lpad(n::text, 7, '0'),
  'Contatto ' || n,
  CASE WHEN n % 3 = 0 THEN ARRAY['vip'] WHEN n % 2 = 0 THEN ARRAY['newsletter'] ELSE ARRAY['lead'] END,
  true,
  now() - (n || ' days')::interval
FROM generate_series(1, 50) AS n
ON CONFLICT (user_id, phone) DO NOTHING;

-- ── Contacts for User 2 (200 contacts) ──────────────────
INSERT INTO contacts (user_id, phone, name, tags, opt_in, opt_in_date)
SELECT
  'c0000000-0000-0000-0000-000000000001',
  '+3934' || lpad(n::text, 7, '0'),
  'Cliente ' || n,
  CASE WHEN n % 5 = 0 THEN ARRAY['vip','premium'] WHEN n % 3 = 0 THEN ARRAY['newsletter'] ELSE ARRAY['lead'] END,
  true,
  now() - (n || ' days')::interval
FROM generate_series(1, 200) AS n
ON CONFLICT (user_id, phone) DO NOTHING;

-- ── Templates for User 1 (3 templates) ──────────────────
INSERT INTO templates (id, user_id, name, category, components, status)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'Benvenuto', 'marketing',
   '[{"type":"header","parameters":[{"type":"text","text":"Ciao {{1}}!"}]},{"type":"body","parameters":[{"type":"text","text":"Benvenuto nel nostro servizio."}]}]'::jsonb,
   'approved'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
   'Promo Estiva', 'marketing',
   '[{"type":"body","parameters":[{"type":"text","text":"{{1}}, approfitta della nostra offerta estiva: {{2}}% di sconto!"}]}]'::jsonb,
   'approved'),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001',
   'Conferma Ordine', 'utility',
   '[{"type":"body","parameters":[{"type":"text","text":"Ordine #{{1}} confermato. Consegna prevista: {{2}}."}]}]'::jsonb,
   'approved')
ON CONFLICT DO NOTHING;

-- ── Templates for User 2 (5 templates) ──────────────────
INSERT INTO templates (id, user_id, name, category, components, status)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'Newsletter Mensile', 'marketing',
   '[{"type":"body","parameters":[{"type":"text","text":"{{1}}, ecco le novità del mese!"}]}]'::jsonb,
   'approved'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   'Offerta Flash', 'marketing',
   '[{"type":"body","parameters":[{"type":"text","text":"{{1}}, solo per oggi: {{2}}!"}]}]'::jsonb,
   'approved'),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
   'Reminder Appuntamento', 'utility',
   '[{"type":"body","parameters":[{"type":"text","text":"Promemoria: appuntamento il {{1}} alle {{2}}."}]}]'::jsonb,
   'approved'),
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001',
   'Feedback Richiesta', 'utility',
   '[{"type":"body","parameters":[{"type":"text","text":"{{1}}, come è stata la tua esperienza? Rispondi con un voto da 1 a 5."}]}]'::jsonb,
   'approved'),
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001',
   'Auguri Compleanno', 'marketing',
   '[{"type":"body","parameters":[{"type":"text","text":"Buon compleanno {{1}}! 🎂 Un regalo speciale ti aspetta."}]}]'::jsonb,
   'approved')
ON CONFLICT DO NOTHING;

-- ── Campaign for User 1 (1 completed) ───────────────────
INSERT INTO campaigns (id, user_id, name, template_id, status, started_at, completed_at, stats)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'Campagna Benvenuto Maggio', 'd0000000-0000-0000-0000-000000000001',
   'completed', now() - interval '5 days', now() - interval '5 days',
   '{"total":45,"sent":45,"delivered":42,"read":38,"failed":3}'::jsonb)
ON CONFLICT DO NOTHING;

-- ── Campaigns for User 2 (3 campaigns) ──────────────────
INSERT INTO campaigns (id, user_id, name, template_id, status, started_at, completed_at, stats)
VALUES
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   'Newsletter Marzo', 'e0000000-0000-0000-0000-000000000001',
   'completed', now() - interval '30 days', now() - interval '30 days',
   '{"total":180,"sent":180,"delivered":170,"read":145,"failed":10}'::jsonb),
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
   'Flash Sale Aprile', 'e0000000-0000-0000-0000-000000000002',
   'completed', now() - interval '10 days', now() - interval '10 days',
   '{"total":200,"sent":200,"delivered":195,"read":160,"failed":5}'::jsonb),
  ('f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001',
   'Reminder Settimanale', 'e0000000-0000-0000-0000-000000000003',
   'running', now() - interval '1 hour', NULL,
   '{"total":200,"sent":120,"delivered":110,"read":80,"failed":2}'::jsonb)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: add seed.sql with admin + 2 test users, contacts, templates, campaigns"
```

---

### Task 4: TypeScript types

**Files:**
- Create: `frontend/src/types/database.ts`
- Create: `frontend/src/types/plans.ts`

- [ ] **Step 1: Create frontend/src/types/database.ts**

```typescript
export type UserRole = "user" | "admin";
export type TemplateCategory = "marketing" | "utility" | "authentication";
export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "failed";
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppConfig {
  id: string;
  user_id: string;
  phone_number_id: string | null;
  waba_id: string | null;
  encrypted_token: string | null;
  webhook_verify_token: string;
  business_name: string | null;
  default_language: string;
  verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiConfig {
  id: string;
  user_id: string;
  mode: "shared" | "byok";
  encrypted_api_key: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  phone: string;
  name: string | null;
  email: string | null;
  language: string;
  tags: string[];
  opt_in: boolean;
  opt_in_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: string;
  user_id: string;
  meta_template_id: string | null;
  name: string;
  language: string;
  category: TemplateCategory;
  components: unknown[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  template_id: string | null;
  segment_query: Record<string, unknown>;
  status: CampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  stats: CampaignStats;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export interface Message {
  id: string;
  campaign_id: string;
  contact_id: string;
  wamid: string | null;
  status: MessageStatus;
  personalized_text: string | null;
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsageCounters {
  id: string;
  user_id: string;
  period_start: string;
  campaigns_used: number;
  messages_used: number;
  contacts_count: number;
}

export interface AuditTrail {
  id: string;
  admin_user_id: string | null;
  action: string;
  target_user_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Create frontend/src/types/plans.ts**

```typescript
export interface PlanFeatures {
  ab_testing: boolean;
  api_access: boolean;
  byok_llm: boolean;
  team_members: boolean;
  approval_workflow: boolean;
  analytics_advanced: boolean;
  webhook_events: boolean;
  white_label: boolean;
  export_data: boolean;
  custom_sender_name: boolean;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  stripe_price_id: string | null;
  max_campaigns_month: number;
  max_contacts: number;
  max_messages_month: number;
  max_templates: number;
  max_team_members: number;
  llm_model: string;
  features: PlanFeatures;
  active: boolean;
  created_at: string;
}

export type PlanResource = "campaigns" | "messages" | "contacts" | "templates" | "team_members";

export interface PlanUsage {
  campaigns_used: number;
  messages_used: number;
  contacts_count: number;
}

export interface UserPlanData {
  plan: Plan;
  usage: PlanUsage;
  subscription: {
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/
git commit -m "feat: add TypeScript types for database schema and plans"
```

---

### Task 5: Supabase client libraries

**Files:**
- Create: `frontend/src/lib/supabase/client.ts`
- Create: `frontend/src/lib/supabase/server.ts`
- Create: `frontend/src/lib/supabase/admin.ts`

- [ ] **Step 1: Create frontend/src/lib/supabase/client.ts**

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create frontend/src/lib/supabase/server.ts**

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}
```

- [ ] **Step 3: Create frontend/src/lib/supabase/admin.ts**

```typescript
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/supabase/
git commit -m "feat: add Supabase client/server/admin libraries"
```

---

### Task 6: Encryption and Redis utilities

**Files:**
- Create: `frontend/src/lib/encryption.ts`
- Create: `frontend/src/lib/redis.ts`

- [ ] **Step 1: Create frontend/src/lib/encryption.ts**

AES-256-GCM with output format `iv:authTag:ciphertext` (all base64).

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 characters");
  }
  return Buffer.from(key, "utf-8");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decrypt(ciphertext: string): string {
  const [ivB64, authTagB64, encryptedB64] = ciphertext.split(":");
  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error("Invalid ciphertext format");
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf-8");
}
```

- [ ] **Step 2: Create frontend/src/lib/redis.ts**

```typescript
import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redis;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/encryption.ts frontend/src/lib/redis.ts
git commit -m "feat: add AES-256-GCM encryption and Redis client utilities"
```

---

### Task 7: Next.js middleware (auth token refresh)

**Files:**
- Create: `frontend/src/middleware.ts`

- [ ] **Step 1: Create frontend/src/middleware.ts**

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session token — must be called to keep session alive
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users away from dashboard
  const isDashboard = request.nextUrl.pathname.startsWith("/(dashboard)") ||
    request.nextUrl.pathname.startsWith("/contacts") ||
    request.nextUrl.pathname.startsWith("/campaigns") ||
    request.nextUrl.pathname.startsWith("/templates") ||
    request.nextUrl.pathname.startsWith("/analytics") ||
    request.nextUrl.pathname.startsWith("/settings");

  if (isDashboard && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect authenticated users away from auth pages
  const isAuth = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/register");

  if (isAuth && user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/middleware.ts
git commit -m "feat: add Next.js middleware for auth token refresh and route protection"
```

---

### Task 8: Route Handler middleware (withAuth, withPlanLimits, withAdminRole)

**Files:**
- Create: `frontend/src/middleware/withAuth.ts`
- Create: `frontend/src/middleware/withPlanLimits.ts`
- Create: `frontend/src/middleware/withAdminRole.ts`

- [ ] **Step 1: Create frontend/src/middleware/withAuth.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@/types/database";

export interface AuthenticatedRequest extends NextRequest {
  user: User;
}

type RouteHandler = (
  req: AuthenticatedRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

export function withAuth(handler: RouteHandler): (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> {
  return async (req, ctx) => {
    const supabase = await createClient();
    const { data: { user: authUser }, error } = await supabase.auth.getUser();

    if (error || !authUser) {
      return NextResponse.json(
        { error: "Non autenticato. Effettua il login." },
        { status: 401 }
      );
    }

    const { data: dbUser } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single();

    if (!dbUser) {
      return NextResponse.json(
        { error: "Utente non trovato." },
        { status: 401 }
      );
    }

    (req as AuthenticatedRequest).user = dbUser as User;
    return handler(req as AuthenticatedRequest, ctx);
  };
}
```

- [ ] **Step 2: Create frontend/src/middleware/withPlanLimits.ts**

```typescript
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthenticatedRequest } from "./withAuth";
import type { Plan, PlanUsage, PlanResource } from "@/types/plans";

const CACHE_TTL = 300; // 5 minutes

interface PlanContext {
  plan: Plan;
  usage: PlanUsage;
}

type RouteHandler = (
  req: AuthenticatedRequest & { planContext: PlanContext },
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

export function withPlanLimits(
  resource: PlanResource,
  handler: RouteHandler
): (
  req: AuthenticatedRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> {
  return async (req, ctx) => {
    const userId = req.user.id;
    const redis = getRedis();
    const cacheKey = `plan:${userId}`;

    let planContext: PlanContext | null = null;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      planContext = JSON.parse(cached);
    }

    // Cache miss — load from DB
    if (!planContext) {
      const supabase = createAdminClient();

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan_id")
        .eq("user_id", userId)
        .single();

      if (!sub) {
        return NextResponse.json(
          { error: "Nessun abbonamento attivo. Scegli un piano." },
          { status: 402 }
        );
      }

      const { data: plan } = await supabase
        .from("plans")
        .select("*")
        .eq("id", sub.plan_id)
        .single();

      if (!plan) {
        return NextResponse.json(
          { error: "Piano non trovato." },
          { status: 500 }
        );
      }

      const { data: usage } = await supabase
        .from("usage_counters")
        .select("campaigns_used, messages_used, contacts_count")
        .eq("user_id", userId)
        .eq("period_start", new Date().toISOString().split("T")[0])
        .single();

      planContext = {
        plan: plan as Plan,
        usage: usage ?? { campaigns_used: 0, messages_used: 0, contacts_count: 0 },
      };

      await redis.set(cacheKey, JSON.stringify(planContext), "EX", CACHE_TTL);
    }

    // Check limits (-1 = unlimited)
    const limitMap: Record<PlanResource, { limit: number; used: number }> = {
      campaigns: {
        limit: planContext.plan.max_campaigns_month,
        used: planContext.usage.campaigns_used,
      },
      messages: {
        limit: planContext.plan.max_messages_month,
        used: planContext.usage.messages_used,
      },
      contacts: {
        limit: planContext.plan.max_contacts,
        used: planContext.usage.contacts_count,
      },
      templates: {
        limit: planContext.plan.max_templates,
        used: 0, // checked at query time
      },
      team_members: {
        limit: planContext.plan.max_team_members,
        used: 0,
      },
    };

    const check = limitMap[resource];
    if (check.limit !== -1 && check.used >= check.limit) {
      // Find suggested upgrade plan
      const supabase = createAdminClient();
      const { data: plans } = await supabase
        .from("plans")
        .select("slug, name")
        .gt("price_cents", planContext.plan.price_cents)
        .order("price_cents", { ascending: true })
        .limit(1);

      return NextResponse.json(
        {
          error: `Hai raggiunto il limite del piano ${planContext.plan.name} per ${resource}.`,
          suggested_plan: plans?.[0]?.slug ?? null,
        },
        { status: 402 }
      );
    }

    const extendedReq = req as AuthenticatedRequest & { planContext: PlanContext };
    extendedReq.planContext = planContext;
    return handler(extendedReq, ctx);
  };
}
```

- [ ] **Step 3: Create frontend/src/middleware/withAdminRole.ts**

```typescript
import { NextResponse } from "next/server";
import type { AuthenticatedRequest } from "./withAuth";

type RouteHandler = (
  req: AuthenticatedRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

export function withAdminRole(handler: RouteHandler): (
  req: AuthenticatedRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> {
  return async (req, ctx) => {
    if (req.user.role !== "admin") {
      return NextResponse.json(
        { error: "Accesso riservato agli amministratori." },
        { status: 403 }
      );
    }
    return handler(req, ctx);
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/middleware/
git commit -m "feat: add withAuth, withPlanLimits, withAdminRole route handler middleware"
```

---

### Task 9: API route /api/me/plan

**Files:**
- Create: `frontend/src/app/api/me/plan/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/middleware/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserPlanData } from "@/types/plans";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const supabase = createAdminClient();
  const userId = req.user.id;

  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select("plan_id, status, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .single();

  if (subError || !sub) {
    return NextResponse.json(
      { error: "Nessun abbonamento trovato." },
      { status: 404 }
    );
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("id", sub.plan_id)
    .single();

  if (!plan) {
    return NextResponse.json(
      { error: "Piano non trovato." },
      { status: 500 }
    );
  }

  const { data: usage } = await supabase
    .from("usage_counters")
    .select("campaigns_used, messages_used, contacts_count")
    .eq("user_id", userId)
    .eq("period_start", new Date().toISOString().split("T")[0])
    .single();

  const result: UserPlanData = {
    plan: plan as UserPlanData["plan"],
    usage: usage ?? { campaigns_used: 0, messages_used: 0, contacts_count: 0 },
    subscription: {
      status: sub.status,
      current_period_end: sub.current_period_end,
      cancel_at_period_end: sub.cancel_at_period_end,
    },
  };

  return NextResponse.json(result);
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/api/me/plan/
git commit -m "feat: add GET /api/me/plan route for current user plan + usage"
```

---

### Task 10: usePlan hook

**Files:**
- Create: `frontend/src/hooks/usePlan.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import useSWR from "swr";
import type { UserPlanData, PlanResource } from "@/types/plans";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function usePlan() {
  const { data, error, isLoading, mutate } = useSWR<UserPlanData>(
    "/api/me/plan",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  function canUse(feature: keyof UserPlanData["plan"]["features"]): boolean {
    if (!data) return false;
    return data.plan.features[feature] === true;
  }

  function usagePercent(resource: PlanResource): number {
    if (!data) return 0;

    const limitMap: Record<PlanResource, { limit: number; used: number }> = {
      campaigns: { limit: data.plan.max_campaigns_month, used: data.usage.campaigns_used },
      messages: { limit: data.plan.max_messages_month, used: data.usage.messages_used },
      contacts: { limit: data.plan.max_contacts, used: data.usage.contacts_count },
      templates: { limit: data.plan.max_templates, used: 0 },
      team_members: { limit: data.plan.max_team_members, used: 0 },
    };

    const check = limitMap[resource];
    if (check.limit === -1) return 0; // unlimited
    return Math.round((check.used / check.limit) * 100);
  }

  return {
    plan: data?.plan ?? null,
    usage: data?.usage ?? null,
    subscription: data?.subscription ?? null,
    isLoading,
    error,
    canUse,
    usagePercent,
    mutate,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/usePlan.ts
git commit -m "feat: add usePlan hook with canUse() and usagePercent()"
```

---

### Task 11: FeatureGate and UpgradePrompt components

**Files:**
- Create: `frontend/src/components/shared/FeatureGate.tsx`
- Create: `frontend/src/components/shared/UpgradePrompt.tsx`

- [ ] **Step 1: Create frontend/src/components/shared/FeatureGate.tsx**

```tsx
"use client";

import { usePlan } from "@/hooks/usePlan";
import type { PlanFeatures } from "@/types/plans";

interface FeatureGateProps {
  feature: keyof PlanFeatures;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { canUse, isLoading } = usePlan();

  if (isLoading) return null;

  if (!canUse(feature)) {
    return fallback ?? null;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Create frontend/src/components/shared/UpgradePrompt.tsx**

UI in Italian. Brand colors: navy bg, teal CTA, pill buttons.

```tsx
"use client";

import { useState } from "react";
import { usePlan } from "@/hooks/usePlan";

const PLAN_ORDER = ["starter", "professional", "enterprise"] as const;

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

const PLAN_PRICES: Record<string, string> = {
  starter: "49",
  professional: "149",
  enterprise: "399",
};

interface UpgradePromptProps {
  suggestedPlan?: string;
  message?: string;
  onClose?: () => void;
}

export function UpgradePrompt({
  suggestedPlan,
  message,
  onClose,
}: UpgradePromptProps) {
  const { plan } = usePlan();
  const [open, setOpen] = useState(true);

  if (!open || !plan) return null;

  const currentIndex = PLAN_ORDER.indexOf(plan.slug as typeof PLAN_ORDER[number]);
  const upgradePlans = PLAN_ORDER.slice(currentIndex + 1);

  function handleClose() {
    setOpen(false);
    onClose?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-brand-navy">
          Potenzia il tuo piano
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {message ?? `Il piano ${plan.name} non include questa funzionalità.`}
        </p>

        <div className="mt-6 space-y-3">
          {upgradePlans.map((slug) => (
            <div
              key={slug}
              className={`flex items-center justify-between rounded-xl border p-4 ${
                slug === suggestedPlan
                  ? "border-brand-teal bg-brand-teal/5"
                  : "border-slate-200"
              }`}
            >
              <div>
                <p className="font-medium text-brand-navy">
                  {PLAN_LABELS[slug]}
                </p>
                <p className="text-sm text-slate-500">
                  {PLAN_PRICES[slug]} &euro;/mese
                </p>
              </div>
              <a
                href={`/settings/billing?upgrade=${slug}`}
                className="rounded-pill bg-brand-teal px-5 py-2 text-sm font-medium text-white hover:bg-brand-teal/90"
              >
                Upgrade
              </a>
            </div>
          ))}
        </div>

        <button
          onClick={handleClose}
          className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600"
        >
          Non ora
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/shared/
git commit -m "feat: add FeatureGate and UpgradePrompt components"
```

---

### Task 12: Build verification and tag

- [ ] **Step 1: Run npm install**

```bash
cd frontend && npm install
```

- [ ] **Step 2: Verify TypeScript build**

```bash
cd frontend && npx next build
```

Expected: Build succeeds with zero TS errors.

- [ ] **Step 3: Verify DB migrations with Docker**

```bash
docker compose down -v && docker compose up -d supabase-db redis
# Wait for healthy
docker compose exec -T supabase-db psql -h localhost -U supabase_admin -d postgres -c "\dt public.*"
```

Expected: All 12 tables listed (original 10 + agent_memory + audit_trail).

- [ ] **Step 4: Run seed**

```bash
docker compose exec -T supabase-db psql -h localhost -U supabase_admin -d postgres -f /docker-entrypoint-initdb.d/seed.sql
```

Expected: Inserts complete without errors.

- [ ] **Step 5: Verify seed data**

```bash
docker compose exec -T supabase-db psql -h localhost -U supabase_admin -d postgres -c "SELECT email, role FROM users ORDER BY email;"
docker compose exec -T supabase-db psql -h localhost -U supabase_admin -d postgres -c "SELECT u.email, p.name as plan FROM subscriptions s JOIN users u ON s.user_id = u.id JOIN plans p ON s.plan_id = p.id;"
docker compose exec -T supabase-db psql -h localhost -U supabase_admin -d postgres -c "SELECT count(*) as total, user_id FROM contacts GROUP BY user_id;"
```

Expected:
- 3 users: admin@wcm.local (admin), user1@test.local (user), user2@test.local (user)
- Subscriptions: admin=Enterprise, user1=Starter, user2=Professional
- Contacts: user1=50, user2=200

- [ ] **Step 6: Tear down and commit any final fixes**

```bash
docker compose down
```

- [ ] **Step 7: Tag phase 2 complete**

```bash
git tag v0.2.0-phase2-auth-middleware
```
