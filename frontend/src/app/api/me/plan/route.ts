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
