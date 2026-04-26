import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sid: "SM123", status: "queued" }) }),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import { TestSendModal } from "@/app/(dashboard)/campaigns/_components/TestSendModal";

describe("TestSendModal", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders with phone input", () => {
    render(<TestSendModal open={true} campaignId="c1" onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Numero destinatario/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Invia test/i })).toBeDefined();
  });

  it("shows success after send", async () => {
    render(<TestSendModal open={true} campaignId="c1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Numero destinatario/i), { target: { value: "+39333123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Invia test/i }));
    await waitFor(() => expect(screen.getByText(/Messaggio inviato/i)).toBeDefined());
  });
});
