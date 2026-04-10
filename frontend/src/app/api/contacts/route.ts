import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/middleware/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const supabase = createAdminClient();
  const url = new URL(req.url);
  const search = url.searchParams.get("search") || "";
  const tag = url.searchParams.get("tag");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 50;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("contacts")
    .select("*", { count: "exact" })
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Errore nel caricamento contatti." }, { status: 500 });
  }

  return NextResponse.json({ contacts: data, total: count, page, limit });
});

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const body = await req.json();
  const { phone, name, email, language, tags, variables } = body;

  if (!phone) {
    return NextResponse.json({ error: "Il numero di telefono è obbligatorio." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({ user_id: req.user.id, phone, name, email, language: language || "it", tags: tags || [], variables: variables || {}, opt_in: true, opt_in_date: new Date().toISOString() })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Questo contatto esiste già." }, { status: 409 });
    }
    return NextResponse.json({ error: "Errore nella creazione del contatto." }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
});
