import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1", name: "VIP" }) }),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import { GroupModal } from "@/app/(dashboard)/groups/_components/GroupModal";

describe("GroupModal", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders create mode with empty fields", () => {
    render(<GroupModal open={true} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Crea gruppo/i })).toBeDefined();
  });

  it("renders edit mode with prefilled group name", () => {
    const group = { id: "1", name: "VIP", description: "Desc", member_count: 5, created_at: "" };
    render(<GroupModal open={true} group={group} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Salva/i })).toBeDefined();
  });

  it("calls POST /groups on create", async () => {
    render(<GroupModal open={true} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Nome gruppo/i), { target: { value: "VIP" } });
    fireEvent.click(screen.getByRole("button", { name: /Crea gruppo/i }));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/groups", expect.objectContaining({ method: "POST" }))
    );
  });
});
