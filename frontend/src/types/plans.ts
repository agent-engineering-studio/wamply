export interface PlanFeatures {
  ab_testing: boolean;
  api_access: boolean;
  byok_llm: boolean;
  team_members: boolean;
  approval_workflow: boolean;
  analytics_advanced: boolean;
  webhook_events: boolean;
  white_label: boolean;
  export_data: boolean;
  custom_sender_name: boolean;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  stripe_price_id: string | null;
  max_campaigns_month: number;
  max_contacts: number;
  max_messages_month: number;
  max_templates: number;
  max_team_members: number;
  llm_model: string;
  features: PlanFeatures;
  active: boolean;
  created_at: string;
}

export type PlanResource = "campaigns" | "messages" | "contacts" | "templates" | "team_members";

export interface PlanUsage {
  campaigns_used: number;
  messages_used: number;
  contacts_count: number;
}

export interface UserPlanData {
  plan: Plan;
  usage: PlanUsage;
  subscription: {
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
  };
}
