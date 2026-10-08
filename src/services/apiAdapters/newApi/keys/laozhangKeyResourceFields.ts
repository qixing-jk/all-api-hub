/** Native LaoZhang field identities shared by editing, presentation and preservation. */
export const LAOZHANG_KEY_FIELD_IDS = {
  BillingType: "billing_type",
  FallbackGroups: "fallback_groups",
  Remark: "remark",
  ActivateOnFirstUse: "activate_on_first_use",
  ValidDuration: "valid_duration",
  RateLimitEnabled: "rate_limit_enabled",
  RateLimitDuration: "rate_limit_duration",
  RateLimitNum: "rate_limit_num",
  RateLimitMessage: "rate_limit_exceeded_message",
  RetryBilling: "retry_keep_billing_type_enabled",
  DiscordProxyUrl: "mj_discord_proxy_url",
  TranslationEnabled: "mj_translate_enabled",
  TranslationBaseUrl: "mj_translate_base_url",
  TranslationApiKey: "mj_translate_api_key",
  TranslationModel: "mj_translate_model",
  Subnet: "subnet",
  IpWhitelist: "ip_whitelist",
  Advertisement: "advertisement",
  AdPosition: "ad_position",
} as const

/** Editor option values map to the site's numeric billing modes on submission. */
export const LAOZHANG_BILLING_TYPES = {
  Usage: "1",
  Request: "2",
  Hybrid: "3",
  UsagePriority: "4",
  RequestPriority: "5",
} as const

/** Auto retains the native nullable retry policy; on/off map to booleans. */
export const LAOZHANG_RETRY_BILLING_MODES = {
  Auto: "auto",
  On: "on",
  Off: "off",
} as const

export const LAOZHANG_AUTO_GROUP = "auto"
