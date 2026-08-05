/** OpenRouter key field identifiers shared by native projections and commands. */
export const OPENROUTER_KEY_FIELD_IDS = {
  Name: "name",
  Workspace: "workspace_id",
  Creator: "creator_user_id",
  LimitMode: "limit_mode",
  Limit: "limit",
  LimitReset: "limit_reset",
  ExpiresAt: "expires_at",
  Disabled: "disabled",
  IncludeByokInLimit: "include_byok_in_limit",
  LimitRemaining: "limit_remaining",
  Usage: "usage",
  UsageDaily: "usage_daily",
  UsageWeekly: "usage_weekly",
  UsageMonthly: "usage_monthly",
  ByokUsage: "byok_usage",
  ByokUsageDaily: "byok_usage_daily",
  ByokUsageWeekly: "byok_usage_weekly",
  ByokUsageMonthly: "byok_usage_monthly",
  CreatedAt: "created_at",
  UpdatedAt: "updated_at",
} as const

export const OPENROUTER_KEY_LIMIT_MODES = {
  Unlimited: "unlimited",
  Limited: "limited",
} as const

export const OPENROUTER_KEY_LIMIT_RESETS = {
  None: "none",
  Daily: "daily",
  Weekly: "weekly",
  Monthly: "monthly",
} as const

export type OpenRouterKeyFieldId =
  (typeof OPENROUTER_KEY_FIELD_IDS)[keyof typeof OPENROUTER_KEY_FIELD_IDS]

export type OpenRouterKeyLimitMode =
  (typeof OPENROUTER_KEY_LIMIT_MODES)[keyof typeof OPENROUTER_KEY_LIMIT_MODES]

export type OpenRouterKeyLimitReset =
  (typeof OPENROUTER_KEY_LIMIT_RESETS)[keyof typeof OPENROUTER_KEY_LIMIT_RESETS]
