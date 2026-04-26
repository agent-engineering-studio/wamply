import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ imported: 3, skipped: 1, errors: [] }),
  }),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import { CsvImportModal } from "@/app/(dashboard)/contacts/_components/CsvImportModal";

describe("CsvImportModal", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders upload UI when open", () => {
    render(<CsvImportModal open={true} onClose={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByText("Importa contatti CSV")).toBeDefined();
    expect(screen.getByText("Scarica template")).toBeDefined();
  });

  it("shows result after successful import", async () => {
    render(<CsvImportModal open={true} onClose={vi.fn()} onImported={vi.fn()} />);

    const input = screen.getByLabelText(/Seleziona file CSV/i) as HTMLInputElement;
    const file = new File(["phone\n+39333000001"], "contacts.csv", { type: "text/csv" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    fireEvent.click(screen.getByRole("button", { name: /^Importa$/i }));

    await waitFor(() => expect(screen.getByText(/3 contatti importati/i)).toBeDefined());
  });
});
