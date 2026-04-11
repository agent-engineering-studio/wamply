# Phase 3 — Settings & Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the settings API routes and UI for WhatsApp, AI, and Agent configuration, with encrypted secret storage and plan-gated BYOK.

**Architecture:** Two API route handlers (whatsapp, ai) using withAuth middleware, AES-256-GCM encryption for tokens/keys, and masked GET responses. Form components use React state + fetch. Settings pages live under a (dashboard) layout with sidebar navigation.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS, shadcn/ui patterns, @supabase/ssr

---

## File Structure

| File | Responsibility |
|------|---------------|
| `frontend/src/app/(dashboard)/layout.tsx` | Dashboard shell with sidebar |
| `frontend/src/components/layout/Sidebar.tsx` | Navigation sidebar |
| `frontend/src/app/api/settings/whatsapp/route.ts` | GET (masked) / PUT (encrypt + store) WhatsApp config |
| `frontend/src/app/api/settings/ai/route.ts` | GET (masked) / PUT (encrypt + store) AI config |
| `frontend/src/components/settings/WhatsAppConfigForm.tsx` | WhatsApp Business API config form |
| `frontend/src/components/settings/AIConfigForm.tsx` | AI config form with Shared/BYOK toggle |
| `frontend/src/components/settings/AgentSettingsForm.tsx` | Agent behavior settings form |
| `frontend/src/app/(dashboard)/settings/page.tsx` | Settings overview page |
| `frontend/src/app/(dashboard)/settings/whatsapp/page.tsx` | WhatsApp settings page |
| `frontend/src/app/(dashboard)/settings/ai/page.tsx` | AI settings page |
| `frontend/src/app/(dashboard)/settings/agent/page.tsx` | Agent settings page |
| `frontend/src/app/(dashboard)/settings/billing/page.tsx` | Billing placeholder |
| `frontend/src/app/(dashboard)/settings/team/page.tsx` | Team placeholder |
