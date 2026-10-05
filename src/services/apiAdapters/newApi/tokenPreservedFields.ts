import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import { readRixApiPreservedTokenFields } from "~/services/apiService/newApiFamily/variants/rixApiTokens"

/** Preserve only the extra writable settings exposed by LaoZhang's inventory. */
function readLaozhangPreservedTokenFields(
  token: NewApiToken,
): Record<string, unknown> {
  // https://api2.laozhang.ai/token v31.1.5 PUT replaces omitted settings.
  // Live name-only edit cleared remark/fallback_groups; never forward the
  // masked key, user identity, timestamps or consumption counters.
  const writableFields = new Set([
    "billing_type",
    "remark",
    "fallback_groups",
    "subnet",
    "ip_whitelist",
    "advertisement",
    "ad_position",
    "rate_limit_duration",
    "rate_limit_num",
    "rate_limit_exceeded_message",
    "retry_keep_billing_type_enabled",
    "activate_on_first_use",
    "valid_duration",
    "mj_discord_proxy_url",
    "mj_translate_base_url",
    "mj_translate_model",
    "mj_translate_enabled",
  ])
  return Object.fromEntries(
    Object.entries(token).filter(([field]) => writableFields.has(field)),
  )
}

const PRESERVED_FIELDS_EXTRACTORS: Partial<
  Record<AccountSiteType, (token: NewApiToken) => Record<string, unknown>>
> = {
  [SITE_TYPES.RIX_API]: readRixApiPreservedTokenFields,
  [SITE_TYPES.LAOZHANG]: readLaozhangPreservedTokenFields,
}

/**
 * Reads the deployment-managed token fields this product's editor does not own.
 *
 * Delegates to provider-bound extractors when a deployment family requires
 * unmanaged columns to travel back in the update payload.
 * @param siteType Site type the write targets, absent when the caller has none.
 * @param token Row as the deployment returned it.
 * @returns Fields to keep in the write body before the owned values are applied.
 */
export function readPreservedTokenFields(
  siteType: AccountSiteType | undefined,
  token: NewApiToken,
): Record<string, unknown> {
  if (!siteType) return {}
  const extractor = PRESERVED_FIELDS_EXTRACTORS[siteType]
  return extractor ? extractor(token) : {}
}
