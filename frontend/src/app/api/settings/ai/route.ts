import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/middleware/withAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_config")
    .select("*")
    .eq("user_id", req.user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({
      mode: "shared",
      api_key_set: false,
      model: "claude-haiku-4-5-20251001",
      temperature: 0.7,
      max_tokens: 500,
    });
  }

  return NextResponse.json({
    mode: data.mode,
    api_key_set: !!data.encrypted_api_key,
    api_key_masked: data.encrypted_api_key ? "sk-ant-••••••••" : null,
    model: data.model,
    temperature: Number(data.temperature),
    max_tokens: data.max_tokens,
  });
});

export const PUT = withAuth(async (req: AuthenticatedRequest) => {
  const body = await req.json();
  const { mode, api_key, model, temperature, max_tokens } = body;

  if (mode && !["shared", "byok"].includes(mode)) {
    return NextResponse.json(
      { error: "Modalità non valida. Scegli 'shared' o 'byok'." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const userId = req.user.id;

  const updateData: Record<string, unknown> = {
    user_id: userId,
    mode: mode || "shared",
    model: model || "claude-haiku-4-5-20251001",
    temperature: temperature ?? 0.7,
    max_tokens: max_tokens ?? 500,
  };

  if (mode === "byok" && api_key) {
    // Test the API key before saving
    try {
      const testRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": api_key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "test" }],
        }),
      });

      if (!testRes.ok) {
        return NextResponse.json(
          { error: "Chiave API Anthropic non valida. Controlla e riprova." },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Impossibile verificare la chiave API. Controlla la connessione." },
        { status: 400 }
      );
    }

    updateData.encrypted_api_key = encrypt(api_key);
  }

  if (mode === "shared") {
    updateData.encrypted_api_key = null;
  }

  const { error } = await supabase
    .from("ai_config")
    .upsert(updateData, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json(
      { error: "Errore nel salvataggio della configurazione AI." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
});
