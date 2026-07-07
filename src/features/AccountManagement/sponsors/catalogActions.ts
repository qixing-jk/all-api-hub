import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { normalizeOptionalAccountAuthType } from "~/features/AccountManagement/utils/accountAuthType"
import type { AuthTypeEnum } from "~/types"
import { isRecord } from "~/utils/core/object"
import { isHttpUrl } from "~/utils/core/urlParsing"

import {
  SPONSOR_ADD_ACCOUNT_ACTION_FIELDS,
  SPONSOR_API_CREDENTIAL_PROFILE_FALLBACK_ACTION_FIELDS,
  SPONSOR_BOOKMARK_FALLBACK_ACTION_FIELDS,
} from "./catalogSchema"
import {
  trimOptionalNonEmptyString,
  validateObjectKeys,
} from "./catalogValidation"
import type { SponsorRecommendationActions } from "./types"

/** Validates the shape of every known action object. */
export function validateActionPayloadShapes(
  itemId: string,
  locale: string,
  actions: Record<string, unknown>,
): string[] {
  const addAccountErrors = validateObjectKeys(
    itemId,
    locale,
    actions.addAccount,
    SPONSOR_ADD_ACCOUNT_ACTION_FIELDS,
    "addAccount action",
  )
  if (addAccountErrors.length > 0) return addAccountErrors

  const bookmarkErrors = validateObjectKeys(
    itemId,
    locale,
    actions.bookmarkFallback,
    SPONSOR_BOOKMARK_FALLBACK_ACTION_FIELDS,
    "bookmarkFallback action",
  )
  if (bookmarkErrors.length > 0) return bookmarkErrors

  return validateObjectKeys(
    itemId,
    locale,
    actions.apiCredentialProfileFallback,
    SPONSOR_API_CREDENTIAL_PROFILE_FALLBACK_ACTION_FIELDS,
    "apiCredentialProfileFallback action",
  )
}

/** Validates and normalizes every supported action payload. */
export function normalizeActions(
  value: unknown,
): SponsorRecommendationActions | false {
  if (value === undefined) return {}
  if (!isRecord(value)) return false

  const addAccount = normalizeAddAccountAction(value.addAccount)
  if (addAccount === false) return false

  const bookmarkFallback = normalizeBookmarkFallbackAction(
    value.bookmarkFallback,
  )
  if (bookmarkFallback === false) return false

  const apiCredentialProfileFallback =
    normalizeApiCredentialProfileFallbackAction(
      value.apiCredentialProfileFallback,
    )
  if (apiCredentialProfileFallback === false) return false

  return {
    ...(addAccount ? { addAccount } : {}),
    ...(bookmarkFallback ? { bookmarkFallback } : {}),
    ...(apiCredentialProfileFallback ? { apiCredentialProfileFallback } : {}),
  }
}

/** Validates sponsor-provided add-account prefill metadata. */
function normalizeAddAccountAction(value: unknown):
  | false
  | undefined
  | {
      siteType: AccountSiteType
      siteUrl: string
      authType?: AuthTypeEnum
    } {
  if (value === undefined) return undefined
  if (!isRecord(value)) return false

  const { siteType, siteUrl, authType } = value
  const normalizedAuthType = normalizeOptionalAccountAuthType(authType)
  if (
    !isAccountSiteType(siteType) ||
    siteType === SITE_TYPES.UNKNOWN ||
    !isHttpUrl(siteUrl) ||
    normalizedAuthType === false
  ) {
    return false
  }

  return {
    siteType,
    siteUrl: siteUrl.trim(),
    ...(normalizedAuthType ? { authType: normalizedAuthType } : {}),
  }
}

/** Validates the bookmark-manager fallback action payload. */
function normalizeBookmarkFallbackAction(
  value: unknown,
): SponsorRecommendationActions["bookmarkFallback"] | false | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return false
  if (!isHttpUrl(value.url)) return false

  return {
    url: value.url.trim(),
  }
}

/** Validates the API credential profile fallback action payload. */
function normalizeApiCredentialProfileFallbackAction(
  value: unknown,
):
  | SponsorRecommendationActions["apiCredentialProfileFallback"]
  | false
  | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return false
  if (!isHttpUrl(value.baseUrl)) return false
  if (
    value.apiKeyCreateUrl !== undefined &&
    !isHttpUrl(value.apiKeyCreateUrl)
  ) {
    return false
  }

  const apiKeyCreateHint = trimOptionalNonEmptyString(value.apiKeyCreateHint)

  return {
    baseUrl: value.baseUrl.trim(),
    ...(value.apiKeyCreateUrl
      ? { apiKeyCreateUrl: value.apiKeyCreateUrl.trim() }
      : {}),
    ...(apiKeyCreateHint ? { apiKeyCreateHint } : {}),
  }
}
