import type { SegmentContent } from "./_schema";
import { SEGMENTS, isSegmentSlug, type SegmentSlug } from "./_segments";

import parrucchieri from "./parrucchieri.json";
import ristoranti from "./ristoranti.json";
import palestre from "./palestre.json";
import studi_medici from "./studi_medici.json";
import avvocati from "./avvocati.json";
import immobiliari from "./immobiliari.json";
import autofficine from "./autofficine.json";
import retail from "./retail.json";
import scuole from "./scuole.json";
import hotel from "./hotel.json";
import autosaloni from "./autosaloni.json";
import alimentari from "./alimentari.json";
import caseifici from "./caseifici.json";

const FILES: Record<SegmentSlug, SegmentContent> = {
  parrucchieri: parrucchieri as SegmentContent,
  ristoranti: ristoranti as SegmentContent,
  palestre: palestre as SegmentContent,
  studi_medici: studi_medici as SegmentContent,
  avvocati: avvocati as SegmentContent,
  immobiliari: immobiliari as SegmentContent,
  autofficine: autofficine as SegmentContent,
  retail: retail as SegmentContent,
  scuole: scuole as SegmentContent,
  hotel: hotel as SegmentContent,
  autosaloni: autosaloni as SegmentContent,
  alimentari: alimentari as SegmentContent,
  caseifici: caseifici as SegmentContent,
};

export function loadSegmentContent(slug: string): SegmentContent | null {
  if (!isSegmentSlug(slug)) return null;
  return FILES[slug] ?? null;
}

export function loadAllSegments(): SegmentContent[] {
  return SEGMENTS.map((s) => FILES[s.slug]);
}
