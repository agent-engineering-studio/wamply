import { NextResponse, type NextRequest } from "next/server";
import { validateRequest } from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";

// Twilio → DB enum (pending, sent, delivered, read, failed)
const STATUS_MAP: Record<string, string> = {
  queued: "pending",
  accepted: "pending",
  scheduled: "pending",
  sending: "pending",
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
  undelivered: "failed",
};

// Twilio error codes that indicate the recipient has opted out / blocked the
// business. When we hit one of these we flip the contact's opt_in to false so
// future campaigns don't waste sends on them.
//
// References:
// - 63015 Channel disabled (recipient blocked the channel)
// - 63037 Recipient opted-out
// - 63045 Recipient opted out (newer)
const OPT_OUT_ERROR_CODES = new Set(["63015", "63037", "63045"]);

export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: "TWILIO_AUTH_TOKEN not configured" }, { status: 500 });
  }

  const bodyText = await req.text();
  const params = Object.fromEntries(new URLSearchParams(bodyText));

  const signature = req.headers.get("x-twilio-signature") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const url = `${proto}://${host}${new URL(req.url).pathname}`;

  if (!validateRequest(authToken, signature, url, params)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const messageSid = params.MessageSid;
  const messageStatus = params.MessageStatus;
  if (!messageSid || !messageStatus) {
    return NextResponse.json({ success: true });
  }

  const status = STATUS_MAP[messageStatus];
  if (!status) {
    return NextResponse.json({ success: true });
  }

  const update: Record<string, unknown> = { status };
  if (status === "delivered") update.delivered_at = new Date().toISOString();
  if (status === "read") update.read_at = new Date().toISOString();
  if (status === "failed") {
    const code = params.ErrorCode;
    const msg = params.ErrorMessage;
    update.error = code ? `${code}: ${msg ?? ""}`.trim() : (msg ?? "Unknown error");
  }

  const supabase = createAdminClient();
  await supabase.from("messages").update(update).eq("provider_message_id", messageSid);

  // Auto opt-out: if the failure code says the recipient blocked us or
  // opted out, flip the contact's opt_in flag so future campaigns skip them.
  if (status === "failed" && params.ErrorCode && OPT_OUT_ERROR_CODES.has(params.ErrorCode)) {
    const { data: msg } = await supabase
      .from("messages")
      .select("contact_id")
      .eq("provider_message_id", messageSid)
      .single();
    if (msg?.contact_id) {
      await supabase
        .from("contacts")
        .update({ opt_in: false, opt_in_date: new Date().toISOString() })
        .eq("id", msg.contact_id);
    }
  }

  return NextResponse.json({ success: true });
}
