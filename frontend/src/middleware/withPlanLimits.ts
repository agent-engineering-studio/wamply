import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthenticatedRequest } from "./withAuth";
import type { Plan, PlanUsage, PlanResource } from "@/types/plans";

const CACHE_TTL = 300;

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

    const cached = await redis.get(cacheKey);
    if (cached) {
      planContext = JSON.parse(cached);
    }

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
        used: 0,
      },
      team_members: {
        limit: planContext.plan.max_team_members,
        used: 0,
      },
    };

    const check = limitMap[resource];
    if (check.limit !== -1 && check.used >= check.limit) {
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
