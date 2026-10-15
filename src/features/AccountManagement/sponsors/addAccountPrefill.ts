import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { normalizeOptionalAccountAuthType } from "~/features/AccountManagement/utils/accountAuthType"
import { resolveAccountSiteDefaultAuthType } from "~/services/accounts/accountSiteProfile/auth"
import { normalizeAccountSiteProfileUrlForStorage } from "~/services/accounts/accountSiteProfile/urls"
import { isRecord } from "~/utils/core/object"
import { isHttpUrl, tryParseHttpUrl } from "~/utils/core/urlParsing"

import {
  BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
  SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE,
  type AddAccountPrefill,
  type SponsorAddAccountPrefill,
} from "./types"

const LEGACY_PREFILL_TTL_MS = 5 * 60 * 1000

/** Identifies validated sponsor add-account prefill values while ignoring UI events. */
export function isSponsorAddAccountPrefill(
  value: unknown,
): value is SponsorAddAccountPrefill {
  return normalizeSponsorAddAccountPrefillPayload(value) !== null
}

/** Identifies validated add-account prefill values while ignoring UI events. */
export function isAddAccountPrefill(
  value: unknown,
): value is AddAccountPrefill {
  return normalizeAddAccountPrefillPayload(value) !== null
}

/**
 * Validates legacy pending-prefill envelopes and preserves their short TTL.
 */
function normalizeLegacyEnvelope(value: unknown): AddAccountPrefill | null {
  if (!isRecord(value)) return null
  if (typeof value.createdAt !== "number") return null
  if (!Number.isFinite(value.createdAt)) return null
  if (Date.now() - value.createdAt > LEGACY_PREFILL_TTL_MS) {
    return null
  }

  return normalizeAddAccountPrefillPayload(value.prefill)
}

/**
 * Validates raw add-account hints and backward-compatible legacy envelopes.
 */
export function normalizeAddAccountPrefill(
  value: unknown,
): AddAccountPrefill | null {
  const envelopePrefill = normalizeLegacyEnvelope(value)
  if (envelopePrefill) return envelopePrefill

  return normalizeAddAccountPrefillPayload(value)
}

/**
 * Backward-compatible sponsor helper name for callers that predate the general prefill contract.
 */
export function normalizeSponsorAddAccountPrefill(
  value: unknown,
): SponsorAddAccountPrefill | null {
  const envelopePrefill = normalizeLegacyEnvelope(value)
  if (envelopePrefill?.source === SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE) {
    return envelopePrefill
  }

  return normalizeSponsorAddAccountPrefillPayload(value)
}

/**
 * Validates a raw add-account prefill payload without accepting storage envelopes.
 */
function normalizeAddAccountPrefillPayload(
  value: unknown,
): AddAccountPrefill | null {
  if (!isRecord(value)) return null
  if (value.source === BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE) {
    return normalizeBookmarkImportAddAccountPrefillPayload(value)
  }

  return normalizeSponsorAddAccountPrefillPayload(value)
}

/**
 * Validates a raw sponsor prefill payload without accepting storage envelopes.
 */
function normalizeSponsorAddAccountPrefillPayload(
  value: unknown,
): SponsorAddAccountPrefill | null {
  if (!isRecord(value)) return null
  if (value.source !== SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE) return null
  if (typeof value.sponsorId !== "string" || !value.sponsorId.trim()) {
    return null
  }
  const siteType = value.siteType
  if (!isAccountSiteType(siteType) || siteType === SITE_TYPES.UNKNOWN) {
    return null
  }
  if (typeof value.siteUrl !== "string") return null
  const normalizedAuthType = normalizeOptionalAccountAuthType(value.authType)
  if (normalizedAuthType === false) return null

  if (!isHttpUrl(value.siteUrl)) {
    return null
  }

  const siteUrl = normalizeAccountSiteProfileUrlForStorage({
    siteType,
    url: value.siteUrl,
  })

  return {
    source: SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE,
    sponsorId: value.sponsorId.trim(),
    siteType,
    siteUrl,
    authType:
      normalizedAuthType ??
      resolveAccountSiteDefaultAuthType({ siteType, url: siteUrl }),
  }
}

/**
 * Validates a raw bookmark-import prefill before it reaches the dialog.
 */
function normalizeBookmarkImportAddAccountPrefillPayload(
  value: Record<string, unknown>,
): AddAccountPrefill | null {
  if (typeof value.siteUrl !== "string") return null
  const normalizedAuthType = normalizeOptionalAccountAuthType(value.authType)
  if (normalizedAuthType === false) return null
  const siteType = isAccountSiteType(value.siteType)
    ? value.siteType
    : SITE_TYPES.UNKNOWN

  const url = tryParseHttpUrl(value.siteUrl)
  if (!url) {
    return null
  }

  const siteUrl =
    siteType !== SITE_TYPES.UNKNOWN
      ? normalizeAccountSiteProfileUrlForStorage({
          siteType,
          url: value.siteUrl,
        })
      : url.origin

  return {
    source: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
    siteUrl,
    ...(siteType !== SITE_TYPES.UNKNOWN ? { siteType } : {}),
    ...(normalizedAuthType ? { authType: normalizedAuthType } : {}),
  }
}
