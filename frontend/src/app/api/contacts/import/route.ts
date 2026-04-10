import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/middleware/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const body = await req.json();
  const { contacts } = body;

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: "Nessun contatto da importare." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const rows = contacts.map((c: Record<string, string>) => ({
    user_id: req.user.id,
    phone: c.phone,
    name: c.name || null,
    email: c.email || null,
    language: c.language || "it",
    tags: c.tags ? (typeof c.tags === "string" ? c.tags.split(",").map((t: string) => t.trim()) : c.tags) : [],
    opt_in: true,
    opt_in_date: new Date().toISOString(),
  }));

  const { data, error } = await supabase.from("contacts").upsert(rows, { onConflict: "user_id,phone", ignoreDuplicates: true }).select();

  if (error) {
    return NextResponse.json({ error: "Errore nell'importazione." }, { status: 500 });
  }

  return NextResponse.json({ imported: data?.length || 0, total: rows.length });
});
