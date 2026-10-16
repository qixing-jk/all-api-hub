import { type ProductAnalyticsEventName } from "~/services/productAnalytics/contracts"
import {
  DISTRIBUTION_CHANNEL,
  isDistributionChannel,
  type DistributionChannel,
} from "~/utils/core/distributionChannel"

import { EVENT_ALLOWED_KEYS } from "./eventSchema"
import { shouldKeepProperty } from "./propertyPolicy"

type SanitizedProperties = Record<string, string | boolean | number>

/** Shared context has its own finite allow-list, independent of event payloads. */
export function sanitizeDistributionChannel(
  value: unknown,
): DistributionChannel {
  return isDistributionChannel(value) ? value : DISTRIBUTION_CHANNEL.Unknown
}

/**
 * Removes non-whitelisted, privacy-sensitive, non-scalar, and invalid enum fields.
 */
export function sanitizeProductAnalyticsEvent(
  eventName: ProductAnalyticsEventName,
  rawProperties: unknown,
): SanitizedProperties {
  if (!rawProperties || typeof rawProperties !== "object") return {}

  const allowedKeys = new Set(EVENT_ALLOWED_KEYS[eventName] ?? [])
  const sanitized: SanitizedProperties = {}

  for (const [key, value] of Object.entries(rawProperties)) {
    if (!shouldKeepProperty(eventName, allowedKeys, key, value)) continue

    sanitized[key] = value
  }

  return sanitized
}
