import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/middleware/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = withAuth(async (req: AuthenticatedRequest, ctx: { params: Promise<Record<string, string>> }) => {
  const { id } = await ctx.params;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("campaigns").select("*, template:templates(name, category)").eq("id", id).eq("user_id", req.user.id).single();
  if (error || !data) return NextResponse.json({ error: "Campagna non trovata." }, { status: 404 });
  return NextResponse.json(data);
});

export const PUT = withAuth(async (req: AuthenticatedRequest, ctx: { params: Promise<Record<string, string>> }) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("campaigns").update(body).eq("id", id).eq("user_id", req.user.id).select().single();
  if (error || !data) return NextResponse.json({ error: "Errore nell'aggiornamento." }, { status: 500 });
  return NextResponse.json(data);
});
