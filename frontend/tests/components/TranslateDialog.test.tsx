import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import { TranslateDialog } from "@/app/(dashboard)/templates/_components/TranslateDialog";

function mockResponse(status: number, json: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  } as Response;
}

describe("<TranslateDialog>", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <TranslateDialog
        open={false}
        templateId="t1"
        templateName="Benvenuto"
        sourceLanguage="it"
        onClose={() => {}}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("excludes the source language from choices", () => {
    render(
      <TranslateDialog
        open={true}
        templateId="t1"
        templateName="Benvenuto"
        sourceLanguage="it"
        onClose={() => {}}
      />
    );
    expect(screen.queryByText("Italiano")).toBeNull();
    expect(screen.getByText("English")).toBeDefined();
    expect(screen.getByText("Español")).toBeDefined();
    expect(screen.getByText("Deutsch")).toBeDefined();
    expect(screen.getByText("Français")).toBeDefined();
  });

  it("disables Traduci button when no language selected", () => {
    render(
      <TranslateDialog
        open={true}
        templateId="t1"
        templateName="Benvenuto"
        sourceLanguage="it"
        onClose={() => {}}
      />
    );
    const btn = screen.getByRole("button", { name: /traduci/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("submits selected languages and renders per-language results", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        results: [
          { language: "en", ok: true, template_id: "t-en", name: "Welcome" },
          { language: "es", ok: false, error: "Translate AI malformato" },
        ],
      })
    );

    const user = userEvent.setup();
    render(
      <TranslateDialog
        open={true}
        templateId="t1"
        templateName="Benvenuto"
        sourceLanguage="it"
        onClose={() => {}}
      />
    );

    await user.click(screen.getByText("English"));
    await user.click(screen.getByText("Español"));
    await user.click(screen.getByRole("button", { name: /traduci \(2\)/i }));

    await waitFor(() => screen.getByText(/Welcome/));
    expect(screen.getByText(/Translate AI malformato/)).toBeDefined();
    expect(screen.getByRole("link", { name: /apri/i }).getAttribute("href")).toBe(
      "/templates/t-en"
    );

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/templates/t1/translate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ target_languages: ["en", "es"] }),
      })
    );
  });

  it("shows upgrade message on 402", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockResponse(402, { detail: "Limit" })
    );
    const user = userEvent.setup();
    render(
      <TranslateDialog
        open={true}
        templateId="t1"
        templateName="Demo"
        sourceLanguage="it"
        onClose={() => {}}
      />
    );
    await user.click(screen.getByText("English"));
    await user.click(screen.getByRole("button", { name: /traduci/i }));
    await waitFor(() =>
      screen.getByText(/Limite mensile AI|piano non abilitato/i)
    );
  });
});
