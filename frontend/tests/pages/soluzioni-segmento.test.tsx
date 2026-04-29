import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import SegmentoPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/soluzioni/[segmento]/page";

describe("/soluzioni/[segmento]", () => {
  it("generateStaticParams returns all 11 segment slugs", async () => {
    const params = await generateStaticParams();
    expect(params).toHaveLength(11);
    expect(params.map((p) => p.segmento)).toContain("parrucchieri");
  });

  it("generateMetadata returns metaTitle for known segment", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ segmento: "parrucchieri" }),
    });
    expect(meta.title).toMatch(/parrucchieri/i);
    expect(meta.description).toBeTruthy();
  });

  it("renders pilot parrucchieri hero and use cases", async () => {
    const el = await SegmentoPage({
      params: Promise.resolve({ segmento: "parrucchieri" }),
    });
    render(el);
    // Content rewritten to marketing-only positioning (campagne broadcast,
    // no transactional messages). See content/soluzioni/parrucchieri.json.
    expect(screen.getByText(/agenda contatti/i)).toBeTruthy();
    expect(screen.getAllByText(/Lancio nuovo trattamento/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Win-back/i).length).toBeGreaterThan(0);
  });

  it("throws NEXT_NOT_FOUND for unknown segment", async () => {
    await expect(
      SegmentoPage({
        params: Promise.resolve({ segmento: "non-esiste" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
