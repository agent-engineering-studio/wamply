import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadSegmentContent } from "@/content/soluzioni/_loader";
import { SEGMENTS } from "@/content/soluzioni/_segments";

import { Hero } from "./_components/Hero";
import { Bullets } from "./_components/Bullets";
import { UseCases } from "./_components/UseCases";
import { TemplatesPreview } from "./_components/TemplatesPreview";
import { PlanTeaser } from "./_components/PlanTeaser";
import { SegmentFooter } from "./_components/SegmentFooter";

type Params = { segmento: string };

export async function generateStaticParams(): Promise<Params[]> {
  return SEGMENTS.map((s) => ({ segmento: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { segmento } = await params;
  const content = loadSegmentContent(segmento);
  if (!content) {
    return { title: "Settore non trovato | Wamply" };
  }
  const url = `https://wamply.it/soluzioni/${content.segmento}`;
  return {
    title: content.metaTitle,
    description: content.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: content.metaTitle,
      description: content.metaDescription,
      url,
      siteName: "Wamply",
      locale: "it_IT",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: content.metaTitle,
      description: content.metaDescription,
    },
  };
}

function ServiceJsonLd({
  segmento,
  label,
  description,
}: {
  segmento: string;
  label: string;
  description: string;
}) {
  const json = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Wamply WhatsApp per ${label}`,
    description,
    provider: {
      "@type": "Organization",
      name: "Wamply",
      url: "https://wamply.it",
    },
    areaServed: "IT",
    serviceType: "WhatsApp Business automation",
    url: `https://wamply.it/soluzioni/${segmento}`,
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}

export default async function SegmentoPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { segmento } = await params;
  const content = loadSegmentContent(segmento);
  if (!content) notFound();

  return (
    <>
      <ServiceJsonLd
        segmento={content.segmento}
        label={content.label}
        description={content.metaDescription}
      />
      <Hero content={content} />
      <Bullets items={content.bullets} />
      <UseCases items={content.useCases} />
      <TemplatesPreview items={content.templatesPreview} />
      <PlanTeaser content={content} />
      <SegmentFooter currentSlug={content.segmento} />
    </>
  );
}
