import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1", phone: "+39333000001", name: "Mario" }) }),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import { ContactModal } from "@/app/(dashboard)/contacts/_components/ContactModal";

describe("ContactModal", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders create mode with empty fields", () => {
    render(<ContactModal open={true} onClose={vi.fn()} onSaved={vi.fn()} />);
    const phoneInput = screen.getByLabelText(/Telefono/i) as HTMLInputElement;
    expect(phoneInput.value).toBe("");
    expect(screen.getByRole("button", { name: /Crea contatto/i })).toBeDefined();
  });

  it("renders edit mode with prefilled fields", () => {
    const contact = { id: "1", phone: "+39333000001", name: "Mario", email: null, tags: ["vip"], opt_in: true, created_at: "" };
    render(<ContactModal open={true} contact={contact} onClose={vi.fn()} onSaved={vi.fn()} />);
    const phoneInput = screen.getByLabelText(/Telefono/i) as HTMLInputElement;
    expect(phoneInput.value).toBe("+39333000001");
    expect(screen.getByRole("button", { name: /Salva/i })).toBeDefined();
  });

  it("calls POST /contacts on create", async () => {
    const onSaved = vi.fn();
    render(<ContactModal open={true} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Telefono/i), { target: { value: "+39333000001" } });
    fireEvent.click(screen.getByRole("button", { name: /Crea contatto/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith("/contacts", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
