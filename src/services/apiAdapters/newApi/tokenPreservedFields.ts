import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import { readRixApiPreservedTokenFields } from "~/services/apiService/newApiFamily/variants/rixApiTokens"

const PRESERVED_FIELDS_EXTRACTORS: Partial<
  Record<AccountSiteType, (token: NewApiToken) => Record<string, unknown>>
> = {
  [SITE_TYPES.RIX_API]: readRixApiPreservedTokenFields,
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
