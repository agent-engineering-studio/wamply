import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/middleware/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const supabase = createAdminClient();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  let query = supabase.from("campaigns").select("*").eq("user_id", req.user.id).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Errore nel caricamento campagne." }, { status: 500 });
  return NextResponse.json({ campaigns: data });
});

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const body = await req.json();
  const { name, template_id, group_id, segment_query, scheduled_at } = body;
  if (!name) return NextResponse.json({ error: "Il nome della campagna è obbligatorio." }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("campaigns").insert({
    user_id: req.user.id, name, template_id, group_id: group_id || null,
    segment_query: segment_query || {}, status: scheduled_at ? "scheduled" : "draft", scheduled_at: scheduled_at || null,
  }).select().single();
  if (error) return NextResponse.json({ error: "Errore nella creazione della campagna." }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
});
