/**
 * Vercel AI Gateway protocol constants, verified 2026-10-24 against
 * `qihang131417-3933` (Hobby) with a team-scoped Vercel access token.
 */
export const VERCEL_ACCOUNT_ENDPOINTS = {
  /** Console identity for the access token: `{user:{id,username,defaultTeamId,…}}`. */
  User: "/v2/user",
  /** Teams the token can act for: `{teams:[{id,slug,name,membership}]}`. */
  Teams: "/v2/teams",
  /** AI Gateway key inventory: `{apiKeys,pagination,quotaEnrichment}`. */
  ApiKeys: "/v1/api-keys",
  Budgets: "/ai-gateway/budgets/list",
  DefaultBudgets: "/ai-gateway/budgets/defaults/list",
} as const

export const VERCEL_GATEWAY_ENDPOINTS = {
  /** `{balance,total_used}` USD strings; needs an AI Gateway key *or* a token plus team. */
  Credits: "/v1/credits",
  /** OpenAI-style model list; public, and annotated when authenticated. */
  Models: "/v1/models",
} as const

/** Only AI Gateway keys are managed here; Vercel has other key purposes. */
export const VERCEL_AI_GATEWAY_KEY_PURPOSE = "ai-gateway"

/**
 * Key management is team-scoped: without `teamId` the account API answers
 * `401 missing_team_param`, and the gateway's credit route rejects the request.
 */
export const VERCEL_TEAM_ID_QUERY_PARAM = "teamId"

export const VERCEL_TEAM_ROLES = {
  Owner: "OWNER",
  AiGatewayBudgetManager: "AI_GATEWAY_BUDGET_MANAGER",
} as const

export const VERCEL_KEY_BUDGET_SCOPE_TYPE = "api-key"

/** Verified native model eligibility and account-wide request restrictions. */
export const VERCEL_MODEL_ELIGIBILITY_STATUSES = {
  Eligible: "eligible",
  Ineligible: "ineligible",
  Unknown: "unknown",
} as const

export const VERCEL_MODEL_BLOCK_REASONS = {
  CustomerVerificationRequired: "customer_verification_required",
  PlanRestricted: "plan_restricted",
} as const
