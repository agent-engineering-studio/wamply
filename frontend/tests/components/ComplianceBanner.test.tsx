import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import { ComplianceBanner } from "@/app/(dashboard)/templates/[id]/_components/ComplianceBanner";
import type { ComplianceReport } from "@/lib/templates/types";

function mockResponse(status: number, json: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  } as Response;
}

const lowReport: ComplianceReport = {
  risk_level: "low",
  score: 0.92,
  issues: [],
  checked_at: "2026-04-20T14:00:00Z",
};

const highReport: ComplianceReport = {
  risk_level: "high",
  score: 0.3,
  issues: [
    {
      text: "ORA O MAI PIU!",
      reason: "urgency artificiale",
      suggestion: "riformula in tono informativo",
    },
  ],
  checked_at: "2026-04-20T14:00:00Z",
};

describe("<ComplianceBanner>", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders 'not verified' CTA when report is null", () => {
    render(
      <ComplianceBanner templateId="t1" report={null} onUpdated={() => {}} />
    );
    expect(screen.getByText(/non ancora verificata/i)).toBeDefined();
    expect(
      screen.getByRole("button", { name: /verifica conformità/i })
    ).toBeDefined();
  });

  it("renders low-risk report with green dot and percentage", () => {
    render(
      <ComplianceBanner templateId="t1" report={lowReport} onUpdated={() => {}} />
    );
    expect(screen.getByText("Conforme")).toBeDefined();
    expect(screen.getByText(/92% prob\. approvazione/)).toBeDefined();
  });

  it("renders high-risk report with issues list", () => {
    render(
      <ComplianceBanner
        templateId="t1"
        report={highReport}
        onUpdated={() => {}}
      />
    );
    expect(screen.getByText("Rischio alto")).toBeDefined();
    expect(screen.getByText(/30% prob/)).toBeDefined();
    expect(screen.getByText('"ORA O MAI PIU!"')).toBeDefined();
    expect(screen.getByText(/urgency artificiale/)).toBeDefined();
    expect(screen.getByText(/riformula in tono informativo/)).toBeDefined();
  });

  it("calls onUpdated with server report after clicking 'Verifica'", async () => {
    apiFetchMock.mockResolvedValueOnce(mockResponse(200, lowReport));
    const onUpdated = vi.fn();
    const user = userEvent.setup();

    render(
      <ComplianceBanner templateId="t1" report={null} onUpdated={onUpdated} />
    );
    await user.click(
      screen.getByRole("button", { name: /verifica conformità/i })
    );

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(lowReport));
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/templates/t1/compliance-check",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows 402 upgrade message on plan-gated response", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockResponse(402, { detail: "Limit" })
    );
    const user = userEvent.setup();
    render(
      <ComplianceBanner templateId="t1" report={null} onUpdated={() => {}} />
    );
    await user.click(
      screen.getByRole("button", { name: /verifica conformità/i })
    );
    await waitFor(() =>
      screen.getByText(/Limite mensile AI|piano non abilitato/i)
    );
  });
});
