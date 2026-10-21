/** Native editor identities shared by descriptors and their presentation policy. */
export const DAYA_KEY_EDITOR_FIELDS = {
  AllowFast: "allowFast",
  CustomKey: "customKey",
  IpWhitelist: "ipWhitelist",
  IpBlacklist: "ipBlacklist",
  RateLimit5h: "rateLimit5h",
  RateLimit1d: "rateLimit1d",
  RateLimit7d: "rateLimit7d",
  Name: "name",
  Groups: "groupIds",
  Unlimited: "unlimited",
  Quota: "quotaUsd",
  Enabled: "enabled",
  ExpiresAt: "expiresAt",
  ExpiresInDays: "expiresInDays",
} as const

/** Inventory fact identities for restrictions and budgets. */
export const DAYA_KEY_FACT_FIELDS = {
  IpWhitelist: "ipWhitelist",
  IpBlacklist: "ipBlacklist",
  RateLimit5h: "rateLimit5h",
  RateLimit1d: "rateLimit1d",
  RateLimit7d: "rateLimit7d",
} as const
