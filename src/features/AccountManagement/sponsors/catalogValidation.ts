import { parseOptionalDate } from "~/utils/core/date"
import { isRecord } from "~/utils/core/object"
import { trimToNull } from "~/utils/core/string"
import { isHttpUrl } from "~/utils/core/urlParsing"

import type { RawSponsorLocaleCampaign } from "./types"

/** Validates optional object keys against a strict allow-list. */
export function validateObjectKeys(
  itemId: string,
  locale: string,
  value: unknown,
  allowedKeys: ReadonlySet<string>,
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
  allowedKeys: ReadonlySet<string>,
): string[] {
  return Object.keys(value).filter((key) => !allowedKeys.has(key))
}

/** Trims display copy and omits blanks or malformed values. */
export function trimNonEmptyString(value: unknown): string | undefined {
  return trimToNull(value) ?? undefined
}

/** Validates and trims an optional HTTP/HTTPS URL string. Returns undefined if omitted, false if invalid, or the trimmed URL. */
export function normalizeOptionalHttpUrl(
  value: unknown,
): string | false | undefined {
  if (value === undefined) return undefined
  if (!isHttpUrl(value)) return false
  return value.trim()
}

/** Checks whether a sponsor id uses the supported stable slug format. */
export function isValidSponsorId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value)
}

/** Checks whether a campaign is active at the provided timestamp. */
export function isActiveInDateRange(
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
