import { NextResponse } from "next/server";
import { withAuth } from "@/middleware/withAuth";
import { withAdminRole } from "@/middleware/withAdminRole";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = withAuth(withAdminRole(async () => {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("users").select("id, email, role, full_name, created_at").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Errore." }, { status: 500 });

  const userIds = data?.map((u) => u.id) || [];
  const { data: subs } = await supabase.from("subscriptions").select("user_id, status, plan_id, plans(name, slug)").in("user_id", userIds);
  const { data: usage } = await supabase.from("usage_counters").select("user_id, messages_used").in("user_id", userIds);

  const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const confirmedMap = new Map<string, boolean>();
  for (const au of authList?.users ?? []) {
    confirmedMap.set(au.id, !!au.email_confirmed_at);
  }

  const enriched = data?.map((u) => {
    const sub = subs?.find((s) => s.user_id === u.id);
    const usg = usage?.find((us) => us.user_id === u.id);
    return {
      ...u,
      subscription: sub || null,
      messages_used: usg?.messages_used || 0,
      email_confirmed: confirmedMap.get(u.id) ?? false,
    };
  });

  return NextResponse.json({ users: enriched });
}));
