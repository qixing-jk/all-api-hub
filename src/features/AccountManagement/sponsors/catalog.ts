import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { normalizeOptionalAccountAuthType } from "~/features/AccountManagement/utils/accountAuthType"
import { isVersionInRange } from "~/services/productAnnouncements/versionRange"
import type { AuthTypeEnum } from "~/types"

import {
  SPONSOR_LOCALE_FALLBACKS,
  type SponsorRecommendationSurface,
} from "./constants"
import {
  SPONSOR_SUPPORT_STATUS,
  SPONSOR_VISIBILITY_BROWSER_FAMILIES,
  type RawSponsorLocaleCampaign,
  type SponsorCatalogNormalizationResult,
  type SponsorCatalogSource,
  type SponsorRecommendation,
  type SponsorRecommendationActions,
  type SponsorSupportStatus,
  type SponsorVisibilityBrowserFamily,
} from "./types"

interface NormalizeSponsorCatalogOptions {
  locale: string
  now?: number
  source: SponsorCatalogSource
  currentVersion?: string
  browserFamily?: SponsorVisibilityBrowserFamily | string
}

const SPONSOR_CATALOG_SCHEMA_VERSION = 5
const ITEM_KEYS = new Set(["id", "locales"])
const LOCALE_KEYS = new Set([
  "enabled",
  "rank",
  "supportStatus",
  "startsAt",
  "endsAt",
  "name",
  "tagline",
  "postClickNote",
  "links",
  "actions",
  "visibility",
])
const VISIBILITY_KEYS = new Set([
  "extensionVersions",
  "excludedBrowserFamilies",
])
const ACTION_KEYS = new Set([
  "addAccount",
  "bookmarkFallback",
  "apiCredentialProfileFallback",
])
const ADD_ACCOUNT_KEYS = new Set(["siteType", "siteUrl", "authType"])
const BOOKMARK_FALLBACK_KEYS = new Set(["url"])
const API_CREDENTIAL_PROFILE_FALLBACK_KEYS = new Set([
  "baseUrl",
  "apiKeyCreateUrl",
  "apiKeyCreateHint",
])
const SPONSOR_SUPPORT_STATUS_VALUES = new Set<string>(
  Object.values(SPONSOR_SUPPORT_STATUS),
)
const SPONSOR_VISIBILITY_BROWSER_FAMILY_VALUES = new Set<string>(
  Object.values(SPONSOR_VISIBILITY_BROWSER_FAMILIES),
)

/** Normalizes a v5 locale-campaign sponsor catalog into UI recommendations. */
export function normalizeSponsorCatalog(
  catalog: unknown,
  options: NormalizeSponsorCatalogOptions,
): SponsorCatalogNormalizationResult {
  if (!isRecord(catalog)) {
    return {
      ok: false,
      items: [],
      errors: ["catalog payload must be an object"],
    }
  }

  const schemaVersion =
    typeof catalog.schemaVersion === "number" ? catalog.schemaVersion : null
  if (schemaVersion !== SPONSOR_CATALOG_SCHEMA_VERSION) {
    return {
      ok: false,
      items: [],
      errors: [`unsupported schemaVersion ${String(catalog.schemaVersion)}`],
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

/** Validates one item and resolves its best locale campaign. */
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

  const extraItemKeys = getUnknownKeys(item, ITEM_KEYS)
  if (extraItemKeys.length > 0) {
    errors.push(
      `item ${itemId} has unsupported top-level fields: ${extraItemKeys.join(
        ", ",
      )}`,
    )
    return undefined
  }

  if (!isRecord(item.locales)) {
    errors.push(`item ${itemId} has invalid locales`)
    return undefined
  }

  const shapeErrors = validateAllLocaleCampaignShapes(itemId, item.locales)
  if (shapeErrors.length > 0) {
    errors.push(...shapeErrors)
    return undefined
  }

  const semanticErrors = validateAllLocaleCampaignSemantics(
    itemId,
    item.locales,
    options,
    now,
  )
  if (semanticErrors.length > 0) {
    errors.push(...semanticErrors)
    return undefined
  }

  const selected = resolveLocaleCampaign(itemId, item.locales, options, now)
  errors.push(...selected.errors)

  if (!selected.recommendation) {
    return undefined
  }

  return {
    ...selected.recommendation,
    id: itemId,
  }
}

/** Tries locale candidates in order until one whole campaign normalizes. */
function resolveLocaleCampaign(
  itemId: string,
  locales: Record<string, unknown>,
  options: NormalizeSponsorCatalogOptions,
  now: number,
): {
  recommendation?: Omit<SponsorRecommendation, "id">
  errors: string[]
} {
  const errors: string[] = []
  const candidateLocales = getLocaleCandidates(options.locale)

  for (const locale of candidateLocales) {
    if (!Object.prototype.hasOwnProperty.call(locales, locale)) continue

    const result = normalizeLocaleCampaign(
      itemId,
      locale,
      locales[locale],
      options,
      now,
    )

    if (result.recommendation) {
      return {
        recommendation: result.recommendation,
        errors,
      }
    }

    errors.push(...result.errors)
  }

  return {
    errors: [
      ...errors,
      `item ${itemId} has no valid localized campaign for ${options.locale}`,
    ],
  }
}

/** Validates strict schema shape for every locale before selecting one campaign. */
function validateAllLocaleCampaignShapes(
  itemId: string,
  locales: Record<string, unknown>,
): string[] {
  return Object.entries(locales).flatMap(([locale, campaign]) =>
    validateLocaleCampaignShape(itemId, locale, campaign),
  )
}

/** Checks locale, link, and action objects for unknown fields. */
function validateLocaleCampaignShape(
  itemId: string,
  locale: string,
  campaign: unknown,
): string[] {
  if (!isRecord(campaign)) {
    return [`item ${itemId} locale ${locale} has invalid shape`]
  }

  const unknownLocaleKeys = getUnknownKeys(campaign, LOCALE_KEYS)
  if (unknownLocaleKeys.length > 0) {
    return [
      `item ${itemId} locale ${locale} has unsupported locale fields: ${unknownLocaleKeys.join(
        ", ",
      )}`,
    ]
  }

  if (campaign.visibility !== undefined) {
    const visibilityShapeErrors = validateVisibilityShape(
      itemId,
      locale,
      campaign.visibility,
    )
    if (visibilityShapeErrors.length > 0) return visibilityShapeErrors
  }

  if (campaign.links !== undefined) {
    const linkShapeErrors = validateObjectKeys(
      itemId,
      locale,
      campaign.links,
      new Set(["primary"]),
      "link",
    )
    if (linkShapeErrors.length > 0) return linkShapeErrors
  }

  if (campaign.actions !== undefined) {
    if (!isRecord(campaign.actions)) {
      return [`item ${itemId} locale ${locale} has invalid actions`]
    }

    const unknownActionKeys = getUnknownKeys(campaign.actions, ACTION_KEYS)
    if (unknownActionKeys.length > 0) {
      return [
        `item ${itemId} locale ${locale} has unsupported action fields: ${unknownActionKeys.join(
          ", ",
        )}`,
      ]
    }

    const actionShapeErrors = validateActionPayloadShapes(
      itemId,
      locale,
      campaign.actions,
    )
    if (actionShapeErrors.length > 0) return actionShapeErrors
  }

  return []
}

/** Semantically validates every enabled active locale campaign before selection. */
function validateAllLocaleCampaignSemantics(
  itemId: string,
  locales: Record<string, unknown>,
  options: NormalizeSponsorCatalogOptions,
  now: number,
): string[] {
  return Object.entries(locales).flatMap(([locale, campaign]) => {
    if (!isActiveEnabledCampaign(campaign, now, options)) return []

    const result = normalizeLocaleCampaign(
      itemId,
      locale,
      campaign,
      options,
      now,
    )

    return result.errors
  })
}

/** Converts a single strict v5 locale campaign into the shared UI contract. */
function normalizeLocaleCampaign(
  itemId: string,
  selectedLocale: string,
  campaign: unknown,
  options: NormalizeSponsorCatalogOptions,
  now: number,
): {
  recommendation?: Omit<SponsorRecommendation, "id">
  errors: string[]
} {
  if (!isRecord(campaign)) {
    return {
      errors: [`item ${itemId} locale ${selectedLocale} has invalid shape`],
    }
  }

  if (campaign.enabled !== true) {
    return {
      errors: [`item ${itemId} locale ${selectedLocale} is disabled`],
    }
  }

  if (typeof campaign.rank !== "number" || !Number.isFinite(campaign.rank)) {
    return {
      errors: [`item ${itemId} locale ${selectedLocale} has invalid rank`],
    }
  }

  if (!isSponsorSupportStatus(campaign.supportStatus)) {
    return {
      errors: [
        `item ${itemId} locale ${selectedLocale} has invalid supportStatus`,
      ],
    }
  }

  if (!isActiveInDateRange(campaign, now)) {
    return {
      errors: [
        `item ${itemId} locale ${selectedLocale} is outside its active date range`,
      ],
    }
  }

  const visibility = getCampaignVisibilityState(campaign.visibility, options)
  if (visibility === "invalid") {
    return {
      errors: [
        `item ${itemId} locale ${selectedLocale} has invalid visibility`,
      ],
    }
  }
  if (visibility === "hidden") {
    return {
      errors: [
        `item ${itemId} locale ${selectedLocale} is outside its visibility constraints`,
      ],
    }
  }

  const name = trimRequiredString(campaign.name)
  const tagline = trimRequiredString(campaign.tagline)

  if (!name || !tagline) {
    return {
      errors: [
        `item ${itemId} locale ${selectedLocale} has invalid name or tagline`,
      ],
    }
  }

  const links = normalizeLinks(campaign.links)
  if (links === false) {
    return {
      errors: [`item ${itemId} locale ${selectedLocale} has invalid links`],
    }
  }

  const actions = normalizeActions(campaign.actions)
  if (actions === false) {
    return {
      errors: [`item ${itemId} locale ${selectedLocale} has invalid actions`],
    }
  }

  const postClickNote = trimOptionalNonEmptyString(campaign.postClickNote)

  return {
    recommendation: {
      rank: campaign.rank,
      supportStatus: campaign.supportStatus,
      links,
      actions,
      selectedLocale,
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      name,
      tagline,
      postClickNote,
      source: options.source,
    },
    errors: [],
  }
}

/** Validates and trims the campaign primary link payload. */
function normalizeLinks(
  value: unknown,
): SponsorRecommendation["links"] | false {
  if (!isRecord(value)) return false
  if (!isSafeHttpUrl(value.primary)) return false

  return {
    primary: value.primary.trim(),
  }
}

/** Validates and normalizes every supported action payload. */
function normalizeActions(
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

/** Validates the bookmark-manager fallback action payload. */
function normalizeBookmarkFallbackAction(
  value: unknown,
): SponsorRecommendationActions["bookmarkFallback"] | false | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return false
  if (!isSafeHttpUrl(value.url)) return false

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
  if (!isSafeHttpUrl(value.baseUrl)) return false
  if (
    value.apiKeyCreateUrl !== undefined &&
    !isSafeHttpUrl(value.apiKeyCreateUrl)
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

/** Builds the exact, base-language, and configured fallback locale chain. */
function getLocaleCandidates(locale: string): string[] {
  const baseLanguage = locale.split("-")[0]
  const preferred = [locale, baseLanguage, ...SPONSOR_LOCALE_FALLBACKS]
  return Array.from(new Set(preferred))
}

/** Checks whether a campaign should be semantically validated as selectable content. */
function isActiveEnabledCampaign(
  campaign: unknown,
  now: number,
  options: NormalizeSponsorCatalogOptions,
): boolean {
  if (!isRecord(campaign) || campaign.enabled !== true) return false

  const startsAt = parseOptionalDate(campaign.startsAt)
  const endsAt = parseOptionalDate(campaign.endsAt)
  if (startsAt === false || endsAt === false) return true

  const isActiveInTimeRange =
    (startsAt === undefined || now >= startsAt) &&
    (endsAt === undefined || now <= endsAt)
  if (!isActiveInTimeRange) return false

  return getCampaignVisibilityState(campaign.visibility, options) !== "hidden"
}

/** Validates the optional V5 campaign visibility object shape. */
function validateVisibilityShape(
  itemId: string,
  locale: string,
  value: unknown,
): string[] {
  if (!isRecord(value)) {
    return [`item ${itemId} locale ${locale} has invalid visibility`]
  }

  const unknownVisibilityKeys = getUnknownKeys(value, VISIBILITY_KEYS)
  if (unknownVisibilityKeys.length > 0) {
    return [
      `item ${itemId} locale ${locale} has unsupported visibility fields: ${unknownVisibilityKeys.join(
        ", ",
      )}`,
    ]
  }

  if (
    value.extensionVersions !== undefined &&
    typeof value.extensionVersions !== "string"
  ) {
    return [`item ${itemId} locale ${locale} has invalid visibility`]
  }

  if (
    value.excludedBrowserFamilies !== undefined &&
    !isStringArray(value.excludedBrowserFamilies)
  ) {
    return [`item ${itemId} locale ${locale} has invalid visibility`]
  }

  return []
}

/** Evaluates whether a V5 visibility object allows the current runtime context. */
function getCampaignVisibilityState(
  value: unknown,
  options: NormalizeSponsorCatalogOptions,
): "visible" | "hidden" | "invalid" {
  if (value === undefined) {
    return "visible"
  }
  if (!isRecord(value)) return "invalid"

  const extensionVersions = value.extensionVersions
  if (extensionVersions !== undefined) {
    if (typeof extensionVersions !== "string") return "invalid"
    const currentVersion = options.currentVersion?.trim()
    if (
      !currentVersion ||
      !isVersionInRange(currentVersion, extensionVersions)
    ) {
      return "hidden"
    }
  }

  const excludedBrowserFamilies = value.excludedBrowserFamilies
  if (excludedBrowserFamilies !== undefined) {
    if (!isStringArray(excludedBrowserFamilies)) return "invalid"
    if (
      excludedBrowserFamilies.some(
        (family) => !SPONSOR_VISIBILITY_BROWSER_FAMILY_VALUES.has(family),
      )
    ) {
      return "invalid"
    }

    const browserFamily = options.browserFamily?.trim()
    if (!browserFamily) return "hidden"
    if (!SPONSOR_VISIBILITY_BROWSER_FAMILY_VALUES.has(browserFamily)) {
      return "invalid"
    }
    if (excludedBrowserFamilies.includes(browserFamily)) {
      return "hidden"
    }
  }

  return "visible"
}

/** Checks whether a value is an array of strings. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

/** Validates the shape of every known action object. */
function validateActionPayloadShapes(
  itemId: string,
  locale: string,
  actions: Record<string, unknown>,
): string[] {
  const addAccountErrors = validateObjectKeys(
    itemId,
    locale,
    actions.addAccount,
    ADD_ACCOUNT_KEYS,
    "addAccount action",
  )
  if (addAccountErrors.length > 0) return addAccountErrors

  const bookmarkErrors = validateObjectKeys(
    itemId,
    locale,
    actions.bookmarkFallback,
    BOOKMARK_FALLBACK_KEYS,
    "bookmarkFallback action",
  )
  if (bookmarkErrors.length > 0) return bookmarkErrors

  return validateObjectKeys(
    itemId,
    locale,
    actions.apiCredentialProfileFallback,
    API_CREDENTIAL_PROFILE_FALLBACK_KEYS,
    "apiCredentialProfileFallback action",
  )
}

/** Validates optional object keys against a strict allow-list. */
function validateObjectKeys(
  itemId: string,
  locale: string,
  value: unknown,
  allowedKeys: Set<string>,
  label: string,
): string[] {
  if (value === undefined) return []
  if (!isRecord(value)) {
    return [`item ${itemId} locale ${locale} has invalid ${label}`]
  }

  const unknownKeys = getUnknownKeys(value, allowedKeys)
  if (unknownKeys.length === 0) return []

  return [
    `item ${itemId} locale ${locale} has unsupported ${label} fields: ${unknownKeys.join(
      ", ",
    )}`,
  ]
}

/** Returns object keys that are outside a strict allow-list. */
function getUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: Set<string>,
): string[] {
  return Object.keys(value).filter((key) => !allowedKeys.has(key))
}

/** Trims a required non-empty string field. */
function trimRequiredString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Trims optional display copy and omits blanks or malformed values. */
function trimOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Checks whether a sponsor id uses the supported stable slug format. */
function isValidSponsorId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value)
}

/** Checks whether a value is a known sponsor support status. */
function isSponsorSupportStatus(value: unknown): value is SponsorSupportStatus {
  return typeof value === "string" && SPONSOR_SUPPORT_STATUS_VALUES.has(value)
}

/** Checks whether a campaign is active at the provided timestamp. */
function isActiveInDateRange(
  campaign: RawSponsorLocaleCampaign | Record<string, unknown>,
  now: number,
): boolean {
  const startsAt = parseOptionalDate(campaign.startsAt)
  const endsAt = parseOptionalDate(campaign.endsAt)

  if (startsAt === false || endsAt === false) {
    return false
  }

  return (
    (startsAt === undefined || now >= startsAt) &&
    (endsAt === undefined || now <= endsAt)
  )
}

/** Parses an optional date string for campaign active-window checks. */
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
    const url = new URL(value.trim())
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/** Checks whether a remote JSON value is a non-null object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
