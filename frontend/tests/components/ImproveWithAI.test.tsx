import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import { ImproveWithAI } from "@/app/(dashboard)/templates/[id]/_components/ImproveWithAI";

function mockResponse(status: number, json: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  } as Response;
}

describe("<ImproveWithAI>", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <ImproveWithAI open={false} body="x" onClose={() => {}} onApply={() => {}} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders 3 variants and applies the chosen one", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        cached: false,
        variants: [
          { style: "short", text: "Ciao {{nome}}, breve." },
          { style: "warm", text: "Ciao {{nome}}, calorosa." },
          { style: "professional", text: "Gentile {{nome}}, formale." },
        ],
      })
    );

    const onApply = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ImproveWithAI
        open={true}
        body="Ciao {{nome}}"
        onClose={onClose}
        onApply={onApply}
      />
    );

    await waitFor(() => screen.getByText("Più breve"));
    expect(screen.getByText("Più caloroso")).toBeDefined();
    expect(screen.getByText("Più formale")).toBeDefined();

    const applyButtons = screen.getAllByRole("button", { name: /applica/i });
    expect(applyButtons).toHaveLength(3);

    await user.click(applyButtons[1]); // warm variant
    expect(onApply).toHaveBeenCalledWith("Ciao {{nome}}, calorosa.");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows cached badge when response has cached=true", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        cached: true,
        variants: [
          { style: "short", text: "a" },
          { style: "warm", text: "b" },
          { style: "professional", text: "c" },
        ],
      })
    );

    render(
      <ImproveWithAI open={true} body="x" onClose={() => {}} onApply={() => {}} />
    );

    await waitFor(() => screen.getByText(/cached/i));
  });

  it("shows 402 upgrade message on plan-gated response", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockResponse(402, { detail: "Limit" })
    );

    render(
      <ImproveWithAI open={true} body="x" onClose={() => {}} onApply={() => {}} />
    );

    await waitFor(() =>
      screen.getByText(/Limite mensile AI raggiunto|piano non abilitato/i)
    );
  });

  it("shows API error on 5xx", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockResponse(502, { detail: "AI error: malformed JSON" })
    );

    render(
      <ImproveWithAI open={true} body="x" onClose={() => {}} onApply={() => {}} />
    );

    await waitFor(() => screen.getByText(/AI error/i));
  });
});
