export interface PlanLimits {
  campaignsMonth: number; // -1 = illimitate
  contacts: number;
  templates: number; // -1 = illimitati
  teamMembers: number;
  aiCreditsMonth: number;
}

export interface PlanPlatformFeatures {
  ab_testing: boolean;
  api_access: boolean;
  byok_llm: boolean;
  approval_workflow: boolean;
  webhook_events: boolean;
  white_label: boolean;
  export_data: boolean;
  custom_sender_name: boolean;
}

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
  limits: PlanLimits;
  platformFeatures: PlanPlatformFeatures;
  onboarding: boolean;
  target: string;
  tagline: string;
  highlighted?: boolean;
}

// Mirrors supabase/migrations/004 + 019 + 020 + 026 plan seed.
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
    limits: {
      campaignsMonth: 1,
      contacts: 500,
      templates: 3,
      teamMembers: 1,
      aiCreditsMonth: 0,
    },
    platformFeatures: {
      ab_testing: false,
      api_access: false,
      byok_llm: false,
      approval_workflow: false,
      webhook_events: false,
      white_label: false,
      export_data: false,
      custom_sender_name: false,
    },
    onboarding: false,
    target: "Micro-impresa o professionista singolo",
    tagline: "Parti con WhatsApp marketing senza vincoli.",
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
    limits: {
      campaignsMonth: 5,
      contacts: 500,
      templates: 5,
      teamMembers: 1,
      aiCreditsMonth: 0,
    },
    platformFeatures: {
      ab_testing: false,
      api_access: false,
      byok_llm: false,
      approval_workflow: false,
      webhook_events: false,
      white_label: false,
      export_data: false,
      custom_sender_name: false,
    },
    onboarding: false,
    target: "Piccola attività con team fino a 5",
    tagline: "La base che ti serve per fare campagne sul serio.",
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
    limits: {
      campaignsMonth: 20,
      contacts: 5000,
      templates: 20,
      teamMembers: 3,
      aiCreditsMonth: 200,
    },
    platformFeatures: {
      ab_testing: true,
      api_access: true,
      byok_llm: false,
      approval_workflow: true,
      webhook_events: false,
      white_label: false,
      export_data: true,
      custom_sender_name: true,
    },
    onboarding: false,
    target: "Attività strutturata o multi-sede",
    tagline: "Cresci senza limiti su volumi, automazioni e team.",
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
    limits: {
      campaignsMonth: -1,
      contacts: 50000,
      templates: -1,
      teamMembers: 10,
      aiCreditsMonth: 1500,
    },
    platformFeatures: {
      ab_testing: true,
      api_access: true,
      byok_llm: true,
      approval_workflow: true,
      webhook_events: true,
      white_label: true,
      export_data: true,
      custom_sender_name: true,
    },
    onboarding: true,
    target: "Grande attività o catena multi-sede",
    tagline: "Su misura per chi gestisce più punti vendita o brand.",
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

export const PLATFORM_FEATURE_LABELS: Record<
  keyof PlanPlatformFeatures,
  string
> = {
  ab_testing: "A/B testing campagne",
  api_access: "API REST pubblica",
  byok_llm: "BYOK LLM (porta tua API key)",
  approval_workflow: "Workflow approvazione invii",
  webhook_events: "Webhook eventi real-time",
  white_label: "White-label (rimuovi branding Wamply)",
  export_data: "Export dati CSV",
  custom_sender_name: "Custom sender name",
};

// Each segment has an image at /segments/<slug>.{webp|svg}.
// `.webp` = AI-generated photo. `.svg` = brand-coherent placeholder.
// To upgrade a placeholder, drop a 1536x1024 .webp with the same slug.
export interface Segment {
  slug: string;
  label: string;
  tagline: string;
  image: string;
}

export const SEGMENTS: readonly Segment[] = [
  { slug: "parrucchieri", label: "Parrucchieri & Estetica",
    tagline: "Lancia trattamenti, compleanni e win-back con un click.",
    image: "/segments/parrucchieri.webp" },
  { slug: "ristoranti", label: "Ristoranti",
    tagline: "Riempi i tavoli con menu stagionali e serate a tema.",
    image: "/segments/ristoranti.webp" },
  { slug: "palestre", label: "Palestre & Fitness",
    tagline: "Lancia nuovi corsi e promo rinnovo alla community.",
    image: "/segments/palestre.webp" },
  { slug: "studi_medici", label: "Studi Medici",
    tagline: "Richiami controlli annuali e nuovi servizi.",
    image: "/segments/studi_medici.webp" },
  { slug: "avvocati", label: "Studi Legali",
    tagline: "Newsletter normativa e lancio nuovi pacchetti.",
    image: "/segments/avvocati.webp" },
  { slug: "immobiliari", label: "Agenzie Immobiliari",
    tagline: "Lanci di nuovi immobili ai contatti giusti, open house ed eventi.",
    image: "/segments/immobiliari.webp" },
  { slug: "autofficine", label: "Autofficine",
    tagline: "Promo cambio gomme e tagliando stagionale.",
    image: "/segments/autofficine.webp" },
  { slug: "retail", label: "Retail & Negozi",
    tagline: "Saldi, nuove collezioni e win-back clienti fedeli.",
    image: "/segments/retail.webp" },
  { slug: "scuole", label: "Scuole & Formazione",
    tagline: "Open day, iscrizioni aperte e lancio nuovi corsi.",
    image: "/segments/scuole.webp" },
  { slug: "hotel", label: "Hotel & B&B",
    tagline: "Pacchetti stagionali, last-minute e win-back ospiti.",
    image: "/segments/hotel.webp" },
  { slug: "autosaloni", label: "Autosaloni",
    tagline: "Nuovi ingressi, promo finanziamento e test drive day.",
    image: "/segments/autosaloni.webp" },
] as const;

export function formatLimit(value: number, unit: string): string {
  if (value === -1) return "Illimitati";
  if (value === 0) return "—";
  return `${value.toLocaleString("it-IT")} ${unit}`.trim();
}
