import { NextResponse } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";
import { withAuth, type AuthenticatedRequest } from "@/middleware/withAuth";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("user_id", req.user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({
      twilio_account_sid: null,
      twilio_from: null,
      twilio_messaging_service_sid: null,
      auth_token_set: false,
      business_name: null,
      default_language: "it",
      verified: false,
    });
  }

  return NextResponse.json({
    twilio_account_sid: data.twilio_account_sid,
    twilio_from: data.twilio_from,
    twilio_messaging_service_sid: data.twilio_messaging_service_sid,
    auth_token_set: !!data.twilio_auth_token_encrypted,
    auth_token_masked: data.twilio_auth_token_encrypted ? "••••••••" : null,
    business_name: data.business_name,
    default_language: data.default_language,
    verified: data.verified,
  });
});

export const PUT = withAuth(async (req: AuthenticatedRequest) => {
  const body = await req.json();
  const {
    account_sid,
    auth_token,
    from: fromNumber,
    messaging_service_sid,
    business_name,
    default_language,
  } = body;

  if (!account_sid) {
    return NextResponse.json(
      { error: "Twilio Account SID obbligatorio." },
      { status: 400 }
    );
  }
  if (!fromNumber && !messaging_service_sid) {
    return NextResponse.json(
      { error: "Serve almeno uno tra 'from' (numero WhatsApp Twilio) o 'messaging_service_sid'." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const userId = req.user.id;

  const updateData: Record<string, unknown> = {
    user_id: userId,
    twilio_account_sid: account_sid,
    twilio_from: fromNumber || null,
    twilio_messaging_service_sid: messaging_service_sid || null,
    business_name: business_name || null,
    default_language: default_language || "it",
  };
  if (auth_token) {
    updateData.twilio_auth_token_encrypted = encrypt(auth_token);
  }

  const { error } = await supabase
    .from("whatsapp_config")
    .upsert(updateData, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json(
      { error: "Errore nel salvataggio della configurazione Twilio." },
      { status: 500 }
    );
  }

  // Verifica credenziali via Twilio Accounts API (se l'auth_token è stato fornito)
  if (auth_token) {
    try {
      const client = twilio(account_sid, auth_token);
      await client.api.v2010.accounts(account_sid).fetch();
      await supabase
        .from("whatsapp_config")
        .update({ verified: true })
        .eq("user_id", userId);
      return NextResponse.json({ success: true, verified: true });
    } catch {
      await supabase
        .from("whatsapp_config")
        .update({ verified: false })
        .eq("user_id", userId);
      return NextResponse.json({
        success: true,
        verified: false,
        warning: "Configurazione salvata ma la verifica con Twilio è fallita. Controlla Account SID e Auth Token.",
      });
    }
  }

  return NextResponse.json({ success: true, verified: false });
});
