import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@/types/database";

export interface AuthenticatedRequest extends NextRequest {
  user: User;
}

type RouteHandler = (
  req: AuthenticatedRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

export function withAuth(handler: RouteHandler): (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> {
  return async (req, ctx) => {
    const supabase = await createClient();
    const { data: { user: authUser }, error } = await supabase.auth.getUser();

    if (error || !authUser) {
      return NextResponse.json(
        { error: "Non autenticato. Effettua il login." },
        { status: 401 }
      );
    }

    const { data: dbUser } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single();

    if (!dbUser) {
      return NextResponse.json(
        { error: "Utente non trovato." },
        { status: 401 }
      );
    }

    (req as AuthenticatedRequest).user = dbUser as User;
    return handler(req as AuthenticatedRequest, ctx);
  };
}
