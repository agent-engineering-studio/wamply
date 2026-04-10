import { NextResponse } from "next/server";
import { withAuth } from "@/middleware/withAuth";
import { withAdminRole } from "@/middleware/withAdminRole";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = withAuth(withAdminRole(async () => {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("campaigns").select("*, user:users(email, full_name)").in("status", ["running", "scheduled"]).order("started_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Errore." }, { status: 500 });
  return NextResponse.json({ campaigns: data });
}));
