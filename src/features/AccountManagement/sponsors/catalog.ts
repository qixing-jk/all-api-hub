import { parseOptionalDate } from "~/utils/core/date"
import { isRecord } from "~/utils/core/object"
import { isHttpUrl } from "~/utils/core/urlParsing"

import { normalizeActions, validateActionPayloadShapes } from "./catalogActions"
import {
  SPONSOR_CAMPAIGN_ACTION_FIELDS,
  SPONSOR_CAMPAIGN_LINK_FIELDS,
  SPONSOR_CATALOG_ITEM_FIELDS,
  SPONSOR_LOCALE_CAMPAIGN_FIELDS,
  SPONSOR_SUPPORT_STATUS_VALUES,
} from "./catalogSchema"
import {
  getUnknownKeys,
  isActiveInDateRange,
  isValidSponsorId,
  trimOptionalNonEmptyString,
  trimRequiredString,
  validateObjectKeys,
} from "./catalogValidation"
import {
  getCampaignVisibilityState,
  SPONSOR_CAMPAIGN_VISIBILITY_STATES,
  validateVisibilityShape,
  type SponsorVisibilityContext,
} from "./catalogVisibility"
import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_LOCALE_FALLBACKS,
  type SponsorRecommendationSurface,
} from "./constants"
import {
  type SponsorCatalogNormalizationResult,
  type SponsorCatalogSource,
  type SponsorRecommendation,
  type SponsorSupportStatus,
} from "./types"

interface NormalizeSponsorCatalogOptions extends SponsorVisibilityContext {
  locale: string
  now?: number
  source: SponsorCatalogSource
}

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

  const extraItemKeys = getUnknownKeys(item, SPONSOR_CATALOG_ITEM_FIELDS)
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

/** Checks locale, link, visibility, and action objects for unknown fields. */
function validateLocaleCampaignShape(
  itemId: string,
  locale: string,
  campaign: unknown,
): string[] {
  if (!isRecord(campaign)) {
    return [`item ${itemId} locale ${locale} has invalid shape`]
  }

  const unknownLocaleKeys = getUnknownKeys(
    campaign,
    SPONSOR_LOCALE_CAMPAIGN_FIELDS,
  )
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
      SPONSOR_CAMPAIGN_LINK_FIELDS,
      "link",
    )
    if (linkShapeErrors.length > 0) return linkShapeErrors
  }

  if (campaign.actions !== undefined) {
    if (!isRecord(campaign.actions)) {
      return [`item ${itemId} locale ${locale} has invalid actions`]
    }

    const unknownActionKeys = getUnknownKeys(
      campaign.actions,
      SPONSOR_CAMPAIGN_ACTION_FIELDS,
    )
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
  if (visibility === SPONSOR_CAMPAIGN_VISIBILITY_STATES.Invalid) {
    return {
      errors: [
        `item ${itemId} locale ${selectedLocale} has invalid visibility`,
      ],
    }
  }
  if (visibility === SPONSOR_CAMPAIGN_VISIBILITY_STATES.Hidden) {
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
  if (!isHttpUrl(value.primary)) return false

  return {
    primary: value.primary.trim(),
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

  return (
    getCampaignVisibilityState(campaign.visibility, options) !==
    SPONSOR_CAMPAIGN_VISIBILITY_STATES.Hidden
  )
}

/** Checks whether a value is a known sponsor support status. */
function isSponsorSupportStatus(value: unknown): value is SponsorSupportStatus {
  return typeof value === "string" && SPONSOR_SUPPORT_STATUS_VALUES.has(value)
}
