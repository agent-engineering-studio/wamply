"use client";

import { usePlan } from "@/hooks/usePlan";
import type { PlanFeatures } from "@/types/plans";

interface FeatureGateProps {
  feature: keyof PlanFeatures;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { canUse, isLoading } = usePlan();

  if (isLoading) return null;

  if (!canUse(feature)) {
    return fallback ?? null;
  }

  return <>{children}</>;
}
