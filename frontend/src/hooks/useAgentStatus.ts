"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export interface AgentStatus {
  active: boolean;
  reason: "byok" | "plan" | "inactive";
  has_byok: boolean;
  plan_has_agent: boolean;
  system_key_set: boolean;
}

export function useAgentStatus(): { status: AgentStatus | null; loaded: boolean } {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch("/settings/agent-status")
      .then((r) => r.json())
      .then((d) => {
        setStatus(d);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  return { status, loaded };
}
