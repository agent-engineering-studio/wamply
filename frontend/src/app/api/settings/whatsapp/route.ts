import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/middleware/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/encryption";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("user_id", req.user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({
      phone_number_id: null,
      waba_id: null,
      token_set: false,
      webhook_verify_token: null,
      business_name: null,
      default_language: "it",
      verified: false,
    });
  }

  return NextResponse.json({
    phone_number_id: data.phone_number_id,
    waba_id: data.waba_id,
    token_set: !!data.encrypted_token,
    token_masked: data.encrypted_token ? "••••••••" : null,
    webhook_verify_token: data.webhook_verify_token,
    business_name: data.business_name,
    default_language: data.default_language,
    verified: data.verified,
  });
});

export const PUT = withAuth(async (req: AuthenticatedRequest) => {
  const body = await req.json();
  const { phone_number_id, waba_id, token, business_name, default_language } = body;

  if (!phone_number_id || !waba_id) {
    return NextResponse.json(
      { error: "Phone Number ID e WABA ID sono obbligatori." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const userId = req.user.id;

  const updateData: Record<string, unknown> = {
    user_id: userId,
    phone_number_id,
    waba_id,
    business_name: business_name || null,
    default_language: default_language || "it",
  };

  if (token) {
    updateData.encrypted_token = encrypt(token);
  }

  const { error } = await supabase
    .from("whatsapp_config")
    .upsert(updateData, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json(
      { error: "Errore nel salvataggio della configurazione WhatsApp." },
      { status: 500 }
    );
  }

  // Optionally verify by calling Meta API
  if (token && phone_number_id) {
    try {
      const whatsappUrl = process.env.WHATSAPP_API_URL || "https://graph.facebook.com";
      const res = await fetch(`${whatsappUrl}/v21.0/${phone_number_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const verified = res.ok;
      await supabase
        .from("whatsapp_config")
        .update({ verified })
        .eq("user_id", userId);

      if (!verified) {
        return NextResponse.json({
          success: true,
          verified: false,
          warning: "Configurazione salvata ma la verifica con Meta API è fallita.",
        });
      }
    } catch {
      // Verification failed but config saved
      return NextResponse.json({
        success: true,
        verified: false,
        warning: "Configurazione salvata. Impossibile verificare il token.",
      });
    }
  }

  return NextResponse.json({ success: true, verified: true });
});
