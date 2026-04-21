import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/middleware/withAuth";

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const body = await req.json();
  const { prompt } = body;

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json(
      { error: "Il prompt è obbligatorio." },
      { status: 400 }
    );
  }

  const agentUrl = process.env.AGENT_URL || "http://localhost:8000";
  const agentSecret = process.env.AGENT_SECRET || "";

  const res = await fetch(`${agentUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Secret": agentSecret,
    },
    body: JSON.stringify({ prompt, user_id: req.user.id }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as Record<string, string>).detail || "Errore nella comunicazione con l'agent." },
      {
        status: res.status,
        // Forward headers agent may set on 402 (suggested plan, credits)
        headers: {
          "X-Suggested-Plan": res.headers.get("x-suggested-plan") || "",
          "X-Credits-Used": res.headers.get("x-credits-used") || "",
          "X-Credits-Limit": res.headers.get("x-credits-limit") || "",
        },
      }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
});
