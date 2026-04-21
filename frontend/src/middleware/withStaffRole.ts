import { NextResponse } from "next/server";
import type { AuthenticatedRequest } from "./withAuth";

type RouteHandler = (
  req: AuthenticatedRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

export function withStaffRole(handler: RouteHandler): (
  req: AuthenticatedRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> {
  return async (req, ctx) => {
    if (req.user.role !== "admin" && req.user.role !== "collaborator") {
      return NextResponse.json(
        { error: "Accesso riservato allo staff." },
        { status: 403 }
      );
    }
    return handler(req, ctx);
  };
}
