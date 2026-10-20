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
  normalizeOptionalHttpUrl,
  trimNonEmptyString,
} from "./catalogValidation"
import type { SponsorRecommendationActions } from "./types"

/** Validates the container shape of known action objects while tolerating unknown action fields. */
export function validateActionPayloadShapes(
  itemId: string,
  locale: string,
  actions: Record<string, unknown>,
): string[] {
  if (actions.addAccount !== undefined && !isRecord(actions.addAccount)) {
    return [`item ${itemId} locale ${locale} has invalid addAccount action`]
  }

  if (
    actions.bookmarkFallback !== undefined &&
    !isRecord(actions.bookmarkFallback)
  ) {
    return [
      `item ${itemId} locale ${locale} has invalid bookmarkFallback action`,
    ]
  }

  if (
    actions.apiCredentialProfileFallback !== undefined &&
    !isRecord(actions.apiCredentialProfileFallback)
  ) {
    return [
      `item ${itemId} locale ${locale} has invalid apiCredentialProfileFallback action`,
    ]
  }

  return []
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

  const url = normalizeOptionalHttpUrl(value.url)
  if (!url) return false

  return {
    url,
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

  const baseUrl = normalizeOptionalHttpUrl(value.baseUrl)
  if (!baseUrl) return false

  const apiKeyCreateUrl = normalizeOptionalHttpUrl(value.apiKeyCreateUrl)
  if (apiKeyCreateUrl === false) return false

  const apiKeyCreateHint = trimNonEmptyString(value.apiKeyCreateHint)

  return {
    baseUrl,
    ...(apiKeyCreateUrl ? { apiKeyCreateUrl } : {}),
    ...(apiKeyCreateHint ? { apiKeyCreateHint } : {}),
  }
}
