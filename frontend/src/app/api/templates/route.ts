import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/middleware/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("templates").select("*").eq("user_id", req.user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Errore nel caricamento template." }, { status: 500 });
  return NextResponse.json({ templates: data });
});

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const body = await req.json();
  const { name, category, language, components } = body;
  if (!name) return NextResponse.json({ error: "Il nome del template è obbligatorio." }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("templates").insert({ user_id: req.user.id, name, category: category || "marketing", language: language || "it", components: components || [] }).select().single();
  if (error) return NextResponse.json({ error: "Errore nella creazione del template." }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
});
