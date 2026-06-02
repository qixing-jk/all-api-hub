import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { normalizeOptionalAccountAuthType } from "~/features/AccountManagement/utils/accountAuthType"
import type { AuthTypeEnum } from "~/types"

import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_LOCALE_FALLBACKS,
  type SponsorRecommendationSurface,
} from "./constants"
import {
  SPONSOR_SUPPORT_STATUS,
  type RawSponsorCatalog,
  type RawSponsorItem,
  type SponsorCatalogNormalizationResult,
  type SponsorCatalogSource,
  type SponsorFallbackHints,
  type SponsorLocalizedContent,
  type SponsorRecommendation,
  type SponsorSupportStatus,
} from "./types"

interface NormalizeSponsorCatalogOptions {
  locale: string
  now?: number
  source: SponsorCatalogSource
}

const SPONSOR_SUPPORT_STATUS_VALUES = new Set<string>(
  Object.values(SPONSOR_SUPPORT_STATUS),
)

/** Normalizes a raw sponsor catalog into display-ready recommendations. */
export function normalizeSponsorCatalog(
  catalog: RawSponsorCatalog,
  options: NormalizeSponsorCatalogOptions,
): SponsorCatalogNormalizationResult {
  if (!isRecord(catalog)) {
    return {
      ok: false,
      items: [],
      errors: ["catalog payload must be an object"],
    }
  }

  if (catalog.schemaVersion !== SPONSOR_CATALOG_SCHEMA_VERSION) {
    return {
      ok: false,
      items: [],
      errors: [`unsupported schemaVersion ${catalog.schemaVersion}`],
    }
  }

  if (!Array.isArray(catalog.items)) {
    return {
      ok: false,
      items: [],
      errors: ["catalog items must be an array"],
    }
  }

  const now = options.now ?? Date.now()
  const errors: string[] = []
  const items = catalog.items.flatMap((item) => {
    const normalized = normalizeSponsorItem(item, options, now, errors)
    return normalized ? [normalized] : []
  })

  items.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))

  return {
    ok: items.length > 0,
    items,
    errors,
  }
}

/** Returns every normalized sponsor recommendation for the selected surface. */
export function selectSponsorRecommendations(
  items: SponsorRecommendation[],
  surface: SponsorRecommendationSurface,
): SponsorRecommendation[] {
  void surface
  return items
}

/** Validates and normalizes one raw sponsor catalog item. */
function normalizeSponsorItem(
  item: unknown,
  options: NormalizeSponsorCatalogOptions,
  now: number,
  errors: string[],
): SponsorRecommendation | undefined {
  if (!isRecord(item)) {
    errors.push("item unknown has invalid shape")
    return undefined
  }

  const itemId = typeof item.id === "string" ? item.id.trim() : item.id

  if (!isValidSponsorId(itemId)) {
    errors.push(`item ${String(itemId)} has invalid id`)
    return undefined
  }

  if (typeof item.enabled !== "boolean") {
    errors.push(`item ${itemId} has invalid enabled flag`)
    return undefined
  }

  if (!item.enabled) {
    errors.push(`item ${itemId} is disabled`)
    return undefined
  }

  if (!isSponsorSupportStatus(item.supportStatus)) {
    errors.push(`item ${itemId} has invalid supportStatus`)
    return undefined
  }

  if (!isActiveInDateRange(item, now)) {
    errors.push(`item ${itemId} is outside its active date range`)
    return undefined
  }

  if (!isSponsorUrls(item.urls)) {
    errors.push(`item ${itemId} has invalid urls`)
    return undefined
  }

  if (!isSafeHttpUrl(item.urls.primaryAffiliate)) {
    errors.push(`item ${itemId} has invalid primaryAffiliate URL`)
    return undefined
  }

  if (item.urls.website !== undefined && !isSafeHttpUrl(item.urls.website)) {
    errors.push(`item ${itemId} has invalid website URL`)
    return undefined
  }

  if (
    item.urls.apiKeyCreate !== undefined &&
    !isSafeHttpUrl(item.urls.apiKeyCreate)
  ) {
    errors.push(`item ${itemId} has invalid apiKeyCreate URL`)
    return undefined
  }

  if (!isRecord(item.locales)) {
    errors.push(`item ${itemId} has invalid locales`)
    return undefined
  }

  const localizedContent = resolveLocalizedValue(
    item.locales,
    options.locale,
    hasNameAndTagline,
  )

  if (!localizedContent) {
    errors.push(`item ${itemId} has no localized name and tagline`)
    return undefined
  }

  const accountPrefill = normalizeAccountPrefill(item)
  if (accountPrefill === false) {
    errors.push(`item ${itemId} has invalid accountPrefill`)
    return undefined
  }

  return {
    id: itemId,
    rank:
      typeof item.rank === "number" && Number.isFinite(item.rank)
        ? item.rank
        : Number.MAX_SAFE_INTEGER,
    supportStatus: item.supportStatus,
    primaryAffiliateUrl: item.urls.primaryAffiliate.trim(),
    websiteUrl: item.urls.website?.trim(),
    apiKeyCreateUrl: item.urls.apiKeyCreate?.trim(),
    name: localizedContent.value.name.trim(),
    tagline: localizedContent.value.tagline.trim(),
    postClickNote: trimOptionalNonEmptyString(
      localizedContent.value.postClickNote,
    ),
    source: options.source,
    accountPrefill: accountPrefill || undefined,
    fallbackHints: normalizeFallbackHints(item.fallbackHints),
  }
}

/** Trims an optional display string and omits it when empty or malformed. */
function trimOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Checks whether a sponsor id uses the supported stable slug format. */
function isValidSponsorId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value)
}

/** Checks whether a raw status is a supported sponsor support status. */
function isSponsorSupportStatus(value: unknown): value is SponsorSupportStatus {
  if (typeof value !== "string") return false

  return SPONSOR_SUPPORT_STATUS_VALUES.has(value)
}

/** Checks whether a sponsor item is active at the provided timestamp. */
function isActiveInDateRange(
  item: Record<string, unknown>,
  now: number,
): boolean {
  const startsAt = parseOptionalDate(item.startsAt)
  const endsAt = parseOptionalDate(item.endsAt)

  if (startsAt === false || endsAt === false) {
    return false
  }

  return (
    (startsAt === undefined || now >= startsAt) &&
    (endsAt === undefined || now <= endsAt)
  )
}

/** Parses an optional ISO-like date string for catalog date-range checks. */
function parseOptionalDate(value: unknown): number | false | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string") return false

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? false : timestamp
}

/** Checks whether a URL is parseable and restricted to HTTP or HTTPS. */
function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/** Checks whether localized sponsor content has the required copy. */
function hasNameAndTagline(value: unknown): value is SponsorLocalizedContent {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.tagline === "string" &&
    value.tagline.trim().length > 0
  )
}

/** Resolves a localized value using exact, base-language, and default fallbacks. */
function resolveLocalizedValue<T>(
  values: Record<string, unknown>,
  locale: string,
  isValid: (value: unknown) => value is T,
): { value: T; locale: string } | undefined {
  for (const candidate of getLocaleCandidates(locale)) {
    const value = values[candidate]
    if (value !== undefined && isValid(value)) {
      return { value, locale: candidate }
    }
  }

  return undefined
}

/** Builds the ordered locale fallback chain for sponsor copy. */
function getLocaleCandidates(locale: string): string[] {
  const baseLanguage = locale.split("-")[0]
  return Array.from(
    new Set([locale, baseLanguage, ...SPONSOR_LOCALE_FALLBACKS]),
  )
}

/** Normalizes fallback hint flags so omitted values become false. */
function normalizeFallbackHints(fallbackHints: unknown): SponsorFallbackHints {
  if (!isRecord(fallbackHints)) {
    return {
      bookmarkManager: false,
      apiCredentialProfiles: false,
    }
  }

  return {
    bookmarkManager: fallbackHints?.bookmarkManager === true,
    apiCredentialProfiles: fallbackHints?.apiCredentialProfiles === true,
  }
}

/** Validates and normalizes sponsor-provided account form prefill metadata. */
function normalizeAccountPrefill(item: Record<string, unknown>):
  | false
  | undefined
  | {
      siteType: AccountSiteType
      siteUrl: string
      authType?: AuthTypeEnum
    } {
  if (item.accountPrefill === undefined) return undefined
  if (!isRecord(item.accountPrefill)) return false

  const { siteType, siteUrl, authType } = item.accountPrefill
  const normalizedAuthType = normalizeOptionalAccountAuthType(authType)
  if (
    !isAccountSiteType(siteType) ||
    siteType === SITE_TYPES.UNKNOWN ||
    !isSafeHttpUrl(siteUrl) ||
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

/** Checks whether a remote JSON value is a non-null object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Checks whether a raw sponsor item has a usable URL object. */
function isSponsorUrls(
  value: unknown,
): value is RawSponsorItem["urls"] & Record<string, unknown> {
  return isRecord(value)
}
