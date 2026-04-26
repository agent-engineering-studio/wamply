import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({
    json: () => Promise.resolve({
      businesses: [
        { business_id: "1", user_id: "user-1", status: "draft", user_email: "a@b.it", brand_name: "A", legal_name: "A SRL", plan_name: null, plan_slug: null, subscription_status: null, application_id: null, vat_number: null, logo_url: null, user_full_name: null, twilio_phone_number: null, submitted_at: null, approved_at: null, rejected_at: null, business_created_at: "2026-01-01T00:00:00Z", application_updated_at: null },
        { business_id: "2", user_id: "user-2", status: "approved", user_email: "c@d.it", brand_name: "B", legal_name: "B SRL", plan_name: null, plan_slug: null, subscription_status: null, application_id: null, vat_number: null, logo_url: null, user_full_name: null, twilio_phone_number: null, submitted_at: null, approved_at: null, rejected_at: null, business_created_at: "2026-01-02T00:00:00Z", application_updated_at: null },
        { business_id: "3", user_id: "user-3", status: "awaiting_docs", user_email: "e@f.it", brand_name: "C", legal_name: "C SRL", plan_name: null, plan_slug: null, subscription_status: null, application_id: null, vat_number: null, logo_url: null, user_full_name: null, twilio_phone_number: null, submitted_at: null, approved_at: null, rejected_at: null, business_created_at: "2026-01-03T00:00:00Z", application_updated_at: null },
      ],
    }),
  }),
}));

import { WhatsAppApplicationsTab } from "@/app/(admin)/admin/_components/WhatsAppApplicationsTab";

describe("WhatsAppApplicationsTab KPI cards", () => {
  it("shows total, da lavorare, approvate KPI cards", async () => {
    render(<WhatsAppApplicationsTab />);
    await screen.findAllByText("3"); // total (KPI card + filter tab both show 3)
    expect(screen.getByText("Totale aziende")).toBeTruthy();
    expect(screen.getAllByText("Da lavorare").length).toBeGreaterThan(0);
    expect(screen.getByText("Approvate / Attive")).toBeTruthy();
    expect(screen.getByText("Sospese / Rifiutate")).toBeTruthy();
  });
});
