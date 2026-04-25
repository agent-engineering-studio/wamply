export type BulletIcon =
  | "calendar"
  | "gift"
  | "users"
  | "chat"
  | "clock"
  | "star"
  | "shield"
  | "sparkles"
  | "check";

export interface SegmentBullet {
  icon: BulletIcon;
  text: string;
}

export interface SegmentUseCase {
  title: string;
  description: string;
  roi: string;
}

export interface SegmentTemplate {
  slug: string;
  title: string;
  preview: string;
}

export interface SegmentTestimonial {
  author: string;
  role: string;
  body: string;
}

export interface SegmentContent {
  segmento: string;
  label: string;
  metaTitle: string;
  metaDescription: string;
  hero: {
    pain: string;
    solution: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  bullets: SegmentBullet[];
  useCases: SegmentUseCase[];
  templatesPreview: SegmentTemplate[];
  /** Slug in plans.ts — avvio / starter (Essenziale) / professional (Plus) / enterprise (Premium). */
  recommendedPlan: "avvio" | "starter" | "professional" | "enterprise";
  testimonial: SegmentTestimonial | null;
  /** Placeholder content = shallow copy with generic body. Used by the index page to label as "in arrivo". */
  isPlaceholder?: boolean;
}
