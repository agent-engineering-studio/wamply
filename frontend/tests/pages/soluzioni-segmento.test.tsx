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
    expect(screen.getByText(/Quanti appuntamenti perdi/)).toBeTruthy();
    expect(screen.getAllByText(/Promemoria appuntamento/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Recall clienti inattivi/)).toBeTruthy();
  });

  it("throws NEXT_NOT_FOUND for unknown segment", async () => {
    await expect(
      SegmentoPage({
        params: Promise.resolve({ segmento: "non-esiste" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
