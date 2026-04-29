import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import SoluzioniIndexPage from "@/app/soluzioni/page";

describe("/soluzioni", () => {
  it("renders grid with all 13 segments", () => {
    render(<SoluzioniIndexPage />);
    expect(screen.getByText("Parrucchieri & Estetisti")).toBeTruthy();
    expect(screen.getByText("Ristoranti & Bar")).toBeTruthy();
    expect(screen.getAllByText(/Autosaloni/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Alimentari/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Caseifici/).length).toBeGreaterThan(0);
    const links = screen.getAllByRole("link");
    const scopriLinks = links.filter((l) =>
      l.getAttribute("href")?.startsWith("/soluzioni/"),
    );
    expect(scopriLinks.length).toBeGreaterThanOrEqual(13);
  });

  it("marks placeholder segments with 'in arrivo' label", () => {
    render(<SoluzioniIndexPage />);
    const inArrivo = screen.getAllByText(/in arrivo/i);
    // 12 placeholders: every segment except parrucchieri (the pilot).
    expect(inArrivo.length).toBe(12);
  });
});
