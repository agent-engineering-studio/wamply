/**
 * Credit cost per AI operation, mirrored from
 * `backend/src/services/ai_models.py` (OPERATION_CREDITS).
 *
 * Keep in sync manually when backend pricing changes — the source of truth
 * for billing is the backend, this map is only used to surface costs in the UI.
 */

export type AIOperation =
  | "chat_turn"
  | "chat_turn_tool_use"
  | "chat_turn_planner"
  | "template_generate"
  | "template_improve"
  | "template_compliance"
  | "template_translate"
  | "personalize_message"
  | "campaign_planner"
  | "campaign_insight"
  | "group_suggest"
  | "contact_tag_suggest"
  | "dashboard_insight";

export const OPERATION_CREDITS: Record<AIOperation, number> = {
  chat_turn: 1.0,
  chat_turn_tool_use: 2.0,
  chat_turn_planner: 3.0,
  template_generate: 2.0,
  template_improve: 3.0,
  template_compliance: 3.0,
  template_translate: 1.0,
  // Bundled with msg_included on the plan — not charged as AI credits.
  personalize_message: 0.0,
  campaign_planner: 5.0,
  campaign_insight: 2.0,
  group_suggest: 2.0,
  contact_tag_suggest: 1.0,
  dashboard_insight: 2.0,
};

/** Operations that route to Opus — UI uses softer "ragionamento avanzato" copy. */
export const ADVANCED_REASONING: ReadonlySet<AIOperation> = new Set<AIOperation>([
  "chat_turn_planner",
  "template_compliance",
  "campaign_planner",
]);

export function formatCredits(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1).replace(/\.0$/, "");
}
