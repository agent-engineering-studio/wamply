export interface PlanTier {
  slug: string;
  displayName: string;
  priceEur: number;
  msgIncluded: number;
  overageRates: { marketing: number; utility: number; free_form: number };
  aiFeatures: {
    compliance_check: boolean;
    generate: boolean;
    improve: boolean;
    translate: boolean;
    analytics_standard: boolean;
    analytics_advanced: boolean;
  };
  onboarding: boolean;
  target: string;
  highlighted?: boolean;
}

// Mirrors supabase/migrations/026_plan_restructure.sql seed.
// slug stays stable (Stripe price ids + API compat); displayName is UI-facing.
export const PLANS: PlanTier[] = [
  {
    slug: "avvio",
    displayName: "Avvio",
    priceEur: 19,
    msgIncluded: 0,
    overageRates: { marketing: 0.09, utility: 0.05, free_form: 0.01 },
    aiFeatures: {
      compliance_check: true,
      generate: false,
      improve: false,
      translate: false,
      analytics_standard: false,
      analytics_advanced: false,
    },
    onboarding: false,
    target: "Micro-impresa o professionista singolo",
  },
  {
    slug: "starter",
    displayName: "Essenziale",
    priceEur: 49,
    msgIncluded: 300,
    overageRates: { marketing: 0.09, utility: 0.05, free_form: 0.01 },
    aiFeatures: {
      compliance_check: true,
      generate: true,
      improve: true,
      translate: false,
      analytics_standard: false,
      analytics_advanced: false,
    },
    onboarding: false,
    target: "Piccola attività con team fino a 5",
    highlighted: true,
  },
  {
    slug: "professional",
    displayName: "Plus",
    priceEur: 149,
    msgIncluded: 1500,
    overageRates: { marketing: 0.08, utility: 0.045, free_form: 0.01 },
    aiFeatures: {
      compliance_check: true,
      generate: true,
      improve: true,
      translate: true,
      analytics_standard: true,
      analytics_advanced: false,
    },
    onboarding: false,
    target: "Attività strutturata o multi-sede",
  },
  {
    slug: "enterprise",
    displayName: "Premium",
    priceEur: 399,
    msgIncluded: 5000,
    overageRates: { marketing: 0.07, utility: 0.04, free_form: 0.01 },
    aiFeatures: {
      compliance_check: true,
      generate: true,
      improve: true,
      translate: true,
      analytics_standard: true,
      analytics_advanced: true,
    },
    onboarding: true,
    target: "Grande attività o catena",
  },
];

export const FEATURE_LABELS: Record<keyof PlanTier["aiFeatures"], string> = {
  compliance_check: "Controllo conformità WhatsApp",
  generate: "Generazione template AI",
  improve: "Riscrittura messaggi AI",
  translate: "Traduzione multi-lingua",
  analytics_standard: "Analytics base (open, click, reply)",
  analytics_advanced: "Analytics avanzati (cohort, predizioni)",
};
