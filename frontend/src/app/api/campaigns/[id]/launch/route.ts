import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/middleware/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const POST = withAuth(async (req: AuthenticatedRequest, ctx: { params: Promise<Record<string, string>> }) => {
  const { id } = await ctx.params;
  const supabase = createAdminClient();

  const { data: campaign } = await supabase.from("campaigns").select("id, status").eq("id", id).eq("user_id", req.user.id).single();
  if (!campaign) return NextResponse.json({ error: "Campagna non trovata." }, { status: 404 });
  if (!["draft", "scheduled"].includes(campaign.status)) {
    return NextResponse.json({ error: `La campagna è in stato '${campaign.status}'.` }, { status: 400 });
  }

  const agentUrl = process.env.AGENT_URL || "http://localhost:8000";
  const agentSecret = process.env.AGENT_SECRET || "";

  const res = await fetch(`${agentUrl}/campaigns/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agent-Secret": agentSecret },
    body: JSON.stringify({ campaign_id: id }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json({ error: (err as Record<string, string>).detail || "Errore nell'avvio della campagna." }, { status: 500 });
  }

  return NextResponse.json({ success: true, campaign_id: id, launched: true });
});
