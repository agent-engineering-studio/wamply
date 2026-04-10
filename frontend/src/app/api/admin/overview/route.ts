import { NextResponse } from "next/server";
import { withAuth } from "@/middleware/withAuth";
import { withAdminRole } from "@/middleware/withAdminRole";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = withAuth(withAdminRole(async () => {
  const supabase = createAdminClient();

  const { count: totalUsers } = await supabase.from("users").select("*", { count: "exact", head: true });
  const { data: subs } = await supabase.from("subscriptions").select("plan_id, plans(price_cents, name, slug)").eq("status", "active");

  const mrr = subs?.reduce((sum, s) => sum + ((s.plans as unknown as Record<string, number>)?.price_cents || 0), 0) || 0;

  const today = new Date().toISOString().split("T")[0];
  const { data: todayUsage } = await supabase.from("usage_counters").select("messages_used").eq("period_start", today);
  const messagesToday = todayUsage?.reduce((sum, u) => sum + u.messages_used, 0) || 0;

  const { count: activeCampaigns } = await supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("status", "running");

  const planBreakdown = subs?.reduce((acc, s) => {
    const plan = s.plans as unknown as Record<string, unknown>;
    const slug = (plan?.slug as string) || "unknown";
    acc[slug] = (acc[slug] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return NextResponse.json({ total_users: totalUsers || 0, mrr_cents: mrr, messages_today: messagesToday, active_campaigns: activeCampaigns || 0, plan_breakdown: planBreakdown || {} });
}));
