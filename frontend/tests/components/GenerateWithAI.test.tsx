import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks (must precede component import) ───────────────

const { pushMock, apiFetchMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import { GenerateWithAI } from "@/app/(dashboard)/templates/_components/GenerateWithAI";

// ── Helpers ─────────────────────────────────────────────

function mockResponse(status: number, json: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  } as Response;
}

// ── Tests ───────────────────────────────────────────────

describe("<GenerateWithAI>", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    pushMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<GenerateWithAI open={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("disables Genera button when prompt is empty", () => {
    render(<GenerateWithAI open={true} onClose={() => {}} />);
    const btn = screen.getByRole("button", { name: /genera$/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("shows preview on successful generation", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockResponse(201, {
        id: "tmpl-1",
        name: "Reminder Appuntamento",
        category: "utility",
        language: "it",
        generated_body: "Ciao {{nome}}, ricorda l'appuntamento del {{data}}.",
        generated_variables: ["nome", "data"],
      })
    );

    const user = userEvent.setup();
    render(<GenerateWithAI open={true} onClose={() => {}} />);

    await user.type(
      screen.getByPlaceholderText(/reminder appuntamento/i),
      "Reminder 24h prima"
    );
    await user.click(screen.getByRole("button", { name: /genera$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Reminder Appuntamento/)).toBeDefined();
    });
    expect(screen.getByText(/Ciao .*nome/)).toBeDefined();
    expect(screen.getByText("{{nome}}")).toBeDefined();
    expect(screen.getByText("{{data}}")).toBeDefined();
  });

  it("shows upgrade message on 402 plan-gated response", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockResponse(402, { detail: "Limit reached" })
    );

    const user = userEvent.setup();
    render(<GenerateWithAI open={true} onClose={() => {}} />);
    await user.type(screen.getByPlaceholderText(/reminder/i), "test");
    await user.click(screen.getByRole("button", { name: /genera$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/piano Professional o Enterprise/i)
      ).toBeDefined();
    });
  });

  it("shows API error message on 5xx response", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockResponse(502, { detail: "AI error: malformed JSON" })
    );

    const user = userEvent.setup();
    render(<GenerateWithAI open={true} onClose={() => {}} />);
    await user.type(screen.getByPlaceholderText(/reminder/i), "test");
    await user.click(screen.getByRole("button", { name: /genera$/i }));

    await waitFor(() => {
      expect(screen.getByText(/AI error/i)).toBeDefined();
    });
  });

  it("redirects to editor on 'Modifica nell'editor'", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockResponse(201, {
        id: "tmpl-xyz",
        name: "Demo",
        category: "marketing",
        language: "it",
        generated_body: "Body",
        generated_variables: [],
      })
    );

    const user = userEvent.setup();
    render(<GenerateWithAI open={true} onClose={() => {}} />);
    await user.type(screen.getByPlaceholderText(/reminder/i), "demo");
    await user.click(screen.getByRole("button", { name: /genera$/i }));

    await waitFor(() => screen.getByText(/Modifica nell'editor/i));
    await user.click(screen.getByRole("button", { name: /Modifica nell'editor/i }));
    expect(pushMock).toHaveBeenCalledWith("/templates/tmpl-xyz");
  });
});
