import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

// ── Mocks ────────────────────────────────────────────────

const updateEq = vi.fn();
const update = vi.fn(() => ({ eq: updateEq }));
const from = vi.fn(() => ({ update }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from }),
}));

// Real twilio.validateRequest (uses HMAC-SHA1). We'll sign params
// correctly in the valid-signature tests, and pass a bogus signature
// in the invalid-signature test.

// ── Import under test (after mocks) ─────────────────────

import { POST } from "@/app/api/webhooks/twilio/route";

// ── Helpers ─────────────────────────────────────────────

const AUTH_TOKEN = "test-auth-token-xyz";
const WEBHOOK_URL = "https://wamply.example.com/api/webhooks/twilio";

function twilioSignature(url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];
  return crypto.createHmac("sha1", AUTH_TOKEN).update(data).digest("base64");
}

function makeRequest(params: Record<string, string>, signature: string) {
  const body = new URLSearchParams(params).toString();
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
      "x-forwarded-proto": "https",
      "x-forwarded-host": "wamply.example.com",
    },
    body,
  });
}

// ── Tests ───────────────────────────────────────────────

describe("POST /api/webhooks/twilio", () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    updateEq.mockReset();
    update.mockClear();
    from.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 500 when TWILIO_AUTH_TOKEN is missing", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const params = { MessageSid: "SM1", MessageStatus: "delivered" };
    const req = makeRequest(params, "any");
    const res = await POST(req as never);
    expect(res.status).toBe(500);
  });

  it("rejects requests with invalid signature", async () => {
    const params = { MessageSid: "SM1", MessageStatus: "delivered" };
    const req = makeRequest(params, "invalid-signature");
    const res = await POST(req as never);
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("updates status to delivered with delivered_at on valid signature", async () => {
    const params = { MessageSid: "SM_abc", MessageStatus: "delivered" };
    const sig = twilioSignature(WEBHOOK_URL, params);
    const req = makeRequest(params, sig);

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledWith("messages");
    const payload = (update.mock.calls as unknown as Record<string, unknown>[][])[0][0];
    expect(payload.status).toBe("delivered");
    expect(payload.delivered_at).toBeTypeOf("string");
    expect(updateEq).toHaveBeenCalledWith("provider_message_id", "SM_abc");
  });

  it("maps undelivered → failed with error from ErrorCode+ErrorMessage", async () => {
    const params = {
      MessageSid: "SM_err",
      MessageStatus: "undelivered",
      ErrorCode: "63016",
      ErrorMessage: "Failed to send freeform message",
    };
    const sig = twilioSignature(WEBHOOK_URL, params);
    const req = makeRequest(params, sig);

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const payload = (update.mock.calls as unknown as Record<string, unknown>[][])[0][0];
    expect(payload.status).toBe("failed");
    expect(payload.error).toBe("63016: Failed to send freeform message");
  });

  it("maps queued → pending (transient)", async () => {
    const params = { MessageSid: "SM_q", MessageStatus: "queued" };
    const sig = twilioSignature(WEBHOOK_URL, params);
    const req = makeRequest(params, sig);

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const payload = (update.mock.calls as unknown as Record<string, unknown>[][])[0][0];
    expect(payload.status).toBe("pending");
  });

  it("ignores unknown MessageStatus without updating DB", async () => {
    const params = { MessageSid: "SM_x", MessageStatus: "zorblax" };
    const sig = twilioSignature(WEBHOOK_URL, params);
    const req = makeRequest(params, sig);

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
  });

  it("ignores body missing MessageSid", async () => {
    const params = { MessageStatus: "delivered" };
    const sig = twilioSignature(WEBHOOK_URL, params);
    const req = makeRequest(params, sig);

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
  });
});
