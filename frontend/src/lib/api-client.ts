import { createClient } from "@/lib/supabase/client";

const KONG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:8100";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(`${KONG_URL}/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...options.headers,
    },
  });
}

/**
 * Calls the agent container via Kong route `/agent/v1/*`.
 * The backend (port 8200) is a different service from the agent (port 8000);
 * Kong proxies `/api/v1/*` → backend and `/agent/v1/*` → agent.
 */
export async function agentFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(`${KONG_URL}/agent/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...options.headers,
    },
  });
}

export async function apiFetcher(path: string) {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
