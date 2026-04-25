import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ plan?: string; segmento?: string }>;

export default async function ProvaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { plan, segmento } = await searchParams;
  const qs = new URLSearchParams({ trial: "14" });
  if (plan) qs.set("plan", plan);
  if (segmento) qs.set("segmento", segmento);
  redirect(`/register?${qs.toString()}`);
}
