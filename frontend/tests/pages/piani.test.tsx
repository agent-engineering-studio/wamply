import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import PianiPage from "@/app/piani/page";

afterEach(cleanup);

describe("/piani", () => {
  it("renders all 4 plan cards with prices", () => {
    render(<PianiPage />);
    // Plan names appear twice: once in PlanCard, once in ComparisonTable header.
    expect(screen.getAllByText("Avvio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Essenziale").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Plus").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Premium").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/€19/)[0]).toBeTruthy();
    expect(screen.getAllByText(/€399/)[0]).toBeTruthy();
  });

  it("highlights Essenziale with 'Consigliato' badge", () => {
    render(<PianiPage />);
    expect(screen.getAllByText("Consigliato")).toHaveLength(1);
  });

  it("updates calculator total when msg count changes", () => {
    render(<PianiPage />);
    const input = screen.getByLabelText(
      /Messaggi\/mese stimati/i,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2000" } });
    // default plan=Essenziale (300 incl) + marketing rate €0.09
    // overage = 1700 × €0.09 = €153 → total = €49 + €153 = €202
    expect(screen.getByText(/Totale stimato: €202\.00/)).toBeTruthy();
  });

  it("shows 0 overage when msg count is within included quota", () => {
    render(<PianiPage />);
    const input = screen.getByLabelText(
      /Messaggi\/mese stimati/i,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "100" } });
    // Essenziale includes 300 → 0 overage → total = €49.00
    expect(screen.getByText(/Totale stimato: €49\.00/)).toBeTruthy();
  });
});
