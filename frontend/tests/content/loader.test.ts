import { describe, it, expect } from "vitest";
import {
  loadSegmentContent,
  loadAllSegments,
} from "@/content/soluzioni/_loader";

describe("content loader", () => {
  it("returns null for unknown segment slug", () => {
    expect(loadSegmentContent("unknown-segment-xyz")).toBeNull();
  });

  it("loads the pilot parrucchieri content with all required fields", () => {
    const content = loadSegmentContent("parrucchieri");
    expect(content).not.toBeNull();
    expect(content!.segmento).toBe("parrucchieri");
    expect(content!.label).toMatch(/Parrucchieri/);
    expect(content!.hero.pain.length).toBeGreaterThan(10);
    expect(content!.bullets).toHaveLength(3);
    expect(content!.useCases).toHaveLength(3);
    expect(content!.templatesPreview).toHaveLength(3);
    expect(content!.recommendedPlan).toBe("starter");
    expect(content!.isPlaceholder).toBeFalsy();
  });

  it("loads placeholder content for non-pilot segments", () => {
    const content = loadSegmentContent("ristoranti");
    expect(content).not.toBeNull();
    expect(content!.isPlaceholder).toBe(true);
  });

  it("loadAllSegments returns one entry per registered segment", () => {
    const all = loadAllSegments();
    expect(all.length).toBe(13);
    const slugs = all.map((s) => s.segmento);
    expect(slugs).toContain("parrucchieri");
    expect(slugs).toContain("autosaloni");
    expect(slugs).toContain("alimentari");
    expect(slugs).toContain("caseifici");
  });
});
