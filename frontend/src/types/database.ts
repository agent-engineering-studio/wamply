export type UserRole = "user" | "admin";
export type TemplateCategory = "marketing" | "utility" | "authentication";
export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "failed";
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppConfig {
  id: string;
  user_id: string;
  twilio_account_sid: string | null;
  twilio_auth_token_encrypted: string | null;
  twilio_from: string | null;
  twilio_messaging_service_sid: string | null;
  business_name: string | null;
  default_language: string;
  verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiConfig {
  id: string;
  user_id: string;
  mode: "shared" | "byok";
  encrypted_api_key: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  phone: string;
  name: string | null;
  email: string | null;
  language: string;
  tags: string[];
  opt_in: boolean;
  opt_in_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: string;
  user_id: string;
  twilio_content_sid: string | null;
  name: string;
  language: string;
  category: TemplateCategory;
  components: unknown[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  template_id: string | null;
  segment_query: Record<string, unknown>;
  status: CampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  stats: CampaignStats;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export interface Message {
  id: string;
  campaign_id: string;
  contact_id: string;
  provider_message_id: string | null;
  status: MessageStatus;
  personalized_text: string | null;
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsageCounters {
  id: string;
  user_id: string;
  period_start: string;
  campaigns_used: number;
  messages_used: number;
  contacts_count: number;
}

export interface AuditTrail {
  id: string;
  admin_user_id: string | null;
  action: string;
  target_user_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}
