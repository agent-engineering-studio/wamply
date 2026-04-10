import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token) {
    const supabase = createAdminClient();
    const { data } = await supabase.from("whatsapp_config").select("id").eq("webhook_verify_token", token).single();
    if (data) return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createAdminClient();

  const entries = body?.entry || [];
  for (const entry of entries) {
    const changes = entry?.changes || [];
    for (const change of changes) {
      const statuses = change?.value?.statuses || [];
      for (const s of statuses) {
        const wamid = s.id;
        const status = s.status; // sent, delivered, read, failed
        if (wamid && status) {
          const updateData: Record<string, unknown> = { status };
          if (status === "delivered") updateData.delivered_at = new Date().toISOString();
          if (status === "read") updateData.read_at = new Date().toISOString();
          if (status === "failed") updateData.error = s.errors?.[0]?.title || "Unknown error";
          await supabase.from("messages").update(updateData).eq("wamid", wamid);
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
