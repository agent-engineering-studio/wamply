import { NextResponse } from "next/server";
import type { AuthenticatedRequest } from "./withAuth";

type RouteHandler = (
  req: AuthenticatedRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

export function withAdminRole(handler: RouteHandler): (
  req: AuthenticatedRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> {
  return async (req, ctx) => {
    if (req.user.role !== "admin") {
      return NextResponse.json(
        { error: "Accesso riservato agli amministratori." },
        { status: 403 }
      );
    }
    return handler(req, ctx);
  };
}
