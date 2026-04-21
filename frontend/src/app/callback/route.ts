import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const VALID_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");

  // Email confirmation link (GoTrue token_hash flow)
  if (token_hash && type && VALID_TYPES.includes(type as EmailOtpType)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash,
    });
    if (error) {
      return NextResponse.redirect(
        new URL(`/confirm-email?error=${encodeURIComponent(error.message)}`, origin),
      );
    }
    return NextResponse.redirect(new URL("/dashboard", origin));
  }

  // OAuth code flow (Google etc. when enabled)
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, origin),
      );
    }
    return NextResponse.redirect(new URL("/dashboard", origin));
  }

  return NextResponse.redirect(new URL("/confirm-email?error=invalid_link", origin));
}
