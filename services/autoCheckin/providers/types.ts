import type { CheckinResultStatus } from "~/types/autoCheckin"

/**
 * Normalized provider result consumed by the auto check-in scheduler/UI.
 *
 * Notes:
 * - `messageKey` should be an i18n key (e.g. `autoCheckin:providerFallback.*`).
 * - `rawMessage` preserves a human-readable backend message when present.
 */
export interface AutoCheckinProviderResult {
  status: CheckinResultStatus
  messageKey?: string
  messageParams?: Record<string, any>
  rawMessage?: string
  data?: any
}
