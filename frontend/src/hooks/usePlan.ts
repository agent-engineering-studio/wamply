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
    if (check.limit === -1) return 0;
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
