/** Native editor identities shared by descriptors and their presentation policy. */
export const AIMLAPI_KEY_EDITOR_FIELDS = {
  Name: "name",
  Scopes: "scopes",
  LimitMode: "limitMode",
  LimitAmount: "limitAmount",
  LimitRetention: "limitRetention",
  AllowedModels: "allowedModels",
  AllowedTools: "allowedTools",
  ExpiresAt: "expiresAt",
  Enabled: "enabled",
} as const

/** Inventory fact identities; the card owns their labels. */
export const AIMLAPI_KEY_FACT_FIELDS = {
  Limit: "limit",
  Used: "used",
  Remaining: "remaining",
  Expiry: "expiry",
  LastUsed: "lastUsed",
  Scopes: "scopes",
  Models: "models",
  MonthlyUsage: "monthlyUsage",
} as const

export const AIMLAPI_KEY_LIMIT_MODES = {
  Unlimited: "unlimited",
  Limited: "limited",
} as const
