import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const body = await req.text();
  // In production, verify Stripe signature here
  const event = JSON.parse(body);
  const supabase = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const planSlug = session.metadata?.plan_slug;
      if (userId && planSlug) {
        const { data: plan } = await supabase.from("plans").select("id").eq("slug", planSlug).single();
        if (plan) {
          await supabase.from("subscriptions").upsert({
            user_id: userId, plan_id: plan.id, stripe_subscription_id: session.subscription, stripe_customer_id: session.customer, status: "active",
          }, { onConflict: "user_id" });
        }
      }
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object;
      const subId = invoice.subscription;
      if (subId) {
        const { data: sub } = await supabase.from("subscriptions").select("user_id").eq("stripe_subscription_id", subId).single();
        if (sub) {
          await supabase.from("usage_counters").upsert({ user_id: sub.user_id, period_start: new Date().toISOString().split("T")[0], campaigns_used: 0, messages_used: 0, contacts_count: 0 }, { onConflict: "user_id,period_start" });
        }
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      await supabase.from("subscriptions").update({ status: "canceled" }).eq("stripe_subscription_id", sub.id);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      await supabase.from("subscriptions").update({ status: "past_due" }).eq("stripe_subscription_id", invoice.subscription);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
