export const SEGMENTS = [
  { slug: "parrucchieri", label: "Parrucchieri & Estetisti" },
  { slug: "ristoranti", label: "Ristoranti & Bar" },
  { slug: "palestre", label: "Palestre & Personal Trainer" },
  { slug: "studi_medici", label: "Studi Medici & Dentisti" },
  { slug: "avvocati", label: "Avvocati & Commercialisti" },
  { slug: "immobiliari", label: "Agenti Immobiliari" },
  { slug: "autofficine", label: "Autofficine & Carrozzerie" },
  { slug: "retail", label: "Negozi & Retail locale" },
  { slug: "scuole", label: "Scuole & Centri formazione" },
  { slug: "hotel", label: "Hotel, B&B & Agriturismo" },
  { slug: "autosaloni", label: "Autosaloni & Concessionarie" },
  { slug: "alimentari", label: "Alimentari & Botteghe" },
  { slug: "caseifici", label: "Caseifici & Latticini" },
] as const;

export type SegmentSlug = (typeof SEGMENTS)[number]["slug"];

export const SEGMENT_SLUGS: readonly SegmentSlug[] = SEGMENTS.map(
  (s) => s.slug,
);

export function isSegmentSlug(value: string): value is SegmentSlug {
  return (SEGMENT_SLUGS as readonly string[]).includes(value);
}
