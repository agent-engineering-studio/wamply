import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { CampaignAnalytics } from "@/app/(dashboard)/campaigns/[id]/_components/CampaignAnalytics";

afterEach(cleanup);

const stats = { total: 200, sent: 200, delivered: 180, read: 120, failed: 3 };

describe("CampaignAnalytics", () => {
  it("shows KPI cards", () => {
    render(<CampaignAnalytics stats={stats} />);
    expect(screen.getAllByText("200").length).toBeGreaterThan(0);
    expect(screen.getAllByText("90%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("67%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("shows funnel bars", () => {
    render(<CampaignAnalytics stats={stats} />);
    expect(screen.getByText(/Tasso consegna/i)).toBeDefined();
    expect(screen.getByText(/Tasso lettura/i)).toBeDefined();
  });
});
