import { LAOZHANG_KEY_FIELD_IDS as field } from "~/services/apiAdapters/newApi/keys/laozhangKeyResourceFields"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"

const LAOZHANG_WRITABLE_FIELDS = new Set<string>([
  field.BillingType,
  field.Remark,
  field.FallbackGroups,
  field.Subnet,
  field.IpWhitelist,
  field.Advertisement,
  field.AdPosition,
  field.RateLimitDuration,
  field.RateLimitNum,
  field.RateLimitMessage,
  field.RetryBilling,
  field.ActivateOnFirstUse,
  field.ValidDuration,
  field.DiscordProxyUrl,
  field.TranslationBaseUrl,
  field.TranslationModel,
  field.TranslationEnabled,
  field.TranslationApiKey,
])

/** Preserve only the extra writable settings exposed by LaoZhang's inventory. */
export function readLaozhangPreservedTokenFields(
  token: NewApiToken,
): Record<string, unknown> {
  // https://api2.laozhang.ai/token v31.1.5 PUT replaces omitted settings.
  // Live name-only edit cleared remark/fallback_groups; never forward the
  // masked key, user identity, timestamps or consumption counters.
  return Object.fromEntries(
    Object.entries(token).filter(
      ([fieldId, value]) =>
        LAOZHANG_WRITABLE_FIELDS.has(fieldId) &&
        (fieldId !== field.TranslationApiKey ||
          (typeof value === "string" && !value.includes("*"))),
    ),
  )
}
