import type { MetadataRoute } from "next";
import { SEGMENTS } from "@/content/soluzioni/_segments";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wamply.it";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE}/soluzioni`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/piani`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
  ];
  const segmentRoutes: MetadataRoute.Sitemap = SEGMENTS.map((s) => ({
    url: `${BASE}/soluzioni/${s.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));
  return [...staticRoutes, ...segmentRoutes];
}
