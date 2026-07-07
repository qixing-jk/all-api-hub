import { isVersionInRange } from "~/services/productAnnouncements/versionRange"
import { isRecord, isStringArray } from "~/utils/core/object"

import {
  SPONSOR_CAMPAIGN_VISIBILITY_FIELDS,
  SPONSOR_VISIBILITY_BROWSER_FAMILY_VALUES,
} from "./catalogSchema"
import { getUnknownKeys } from "./catalogValidation"
import type { SponsorVisibilityBrowserFamily } from "./types"

export interface SponsorVisibilityContext {
  currentVersion?: string
  browserFamily?: SponsorVisibilityBrowserFamily | string
}

export const SPONSOR_CAMPAIGN_VISIBILITY_STATES = {
  Visible: "visible",
  Hidden: "hidden",
  Invalid: "invalid",
} as const

type SponsorCampaignVisibilityState =
  (typeof SPONSOR_CAMPAIGN_VISIBILITY_STATES)[keyof typeof SPONSOR_CAMPAIGN_VISIBILITY_STATES]

/** Normalizes a runtime browser family before visibility evaluation. */
function normalizeBrowserFamily(
  value: SponsorVisibilityContext["browserFamily"],
): SponsorVisibilityBrowserFamily | undefined {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return undefined
  if (!SPONSOR_VISIBILITY_BROWSER_FAMILY_VALUES.has(normalized)) {
    return undefined
  }
  return normalized as SponsorVisibilityBrowserFamily
}

/** Validates the optional V5 campaign visibility object shape. */
export function validateVisibilityShape(
  itemId: string,
  locale: string,
  value: unknown,
): string[] {
  if (!isRecord(value)) {
    return [`item ${itemId} locale ${locale} has invalid visibility`]
  }

  const unknownVisibilityKeys = getUnknownKeys(
    value,
    SPONSOR_CAMPAIGN_VISIBILITY_FIELDS,
  )
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
export function getCampaignVisibilityState(
  value: unknown,
  context: SponsorVisibilityContext,
): SponsorCampaignVisibilityState {
  if (value === undefined) {
    return SPONSOR_CAMPAIGN_VISIBILITY_STATES.Visible
  }
  if (!isRecord(value)) return SPONSOR_CAMPAIGN_VISIBILITY_STATES.Invalid

  const extensionVersions = value.extensionVersions
  if (extensionVersions !== undefined) {
    if (typeof extensionVersions !== "string") {
      return SPONSOR_CAMPAIGN_VISIBILITY_STATES.Invalid
    }
    const currentVersion = context.currentVersion?.trim()
    if (
      !currentVersion ||
      !isVersionInRange(currentVersion, extensionVersions)
    ) {
      return SPONSOR_CAMPAIGN_VISIBILITY_STATES.Hidden
    }
  }

  const excludedBrowserFamilies = value.excludedBrowserFamilies
  if (excludedBrowserFamilies !== undefined) {
    if (!isStringArray(excludedBrowserFamilies)) {
      return SPONSOR_CAMPAIGN_VISIBILITY_STATES.Invalid
    }
    if (
      excludedBrowserFamilies.some(
        (family) => !SPONSOR_VISIBILITY_BROWSER_FAMILY_VALUES.has(family),
      )
    ) {
      return SPONSOR_CAMPAIGN_VISIBILITY_STATES.Invalid
    }

    const browserFamily = normalizeBrowserFamily(context.browserFamily)
    if (!browserFamily) return SPONSOR_CAMPAIGN_VISIBILITY_STATES.Hidden
    if (excludedBrowserFamilies.includes(browserFamily)) {
      return SPONSOR_CAMPAIGN_VISIBILITY_STATES.Hidden
    }
  }

  return SPONSOR_CAMPAIGN_VISIBILITY_STATES.Visible
}
