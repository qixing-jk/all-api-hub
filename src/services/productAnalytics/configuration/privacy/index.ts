import { type ProductAnalyticsEventName } from "~/services/productAnalytics/contracts"

import { EVENT_ALLOWED_KEYS } from "./eventSchema"
import { shouldKeepProperty } from "./propertyPolicy"

type SanitizedProperties = Record<string, string | boolean | number>

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
