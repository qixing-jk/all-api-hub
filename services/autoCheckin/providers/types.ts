import type { CheckinResultStatus } from "~/types/autoCheckin"

/**
 * Normalized provider result consumed by the auto check-in scheduler/UI.
 *
 * Notes:
 * - `messageKey` should be an i18n key (e.g. `autoCheckin:providerFallback.*`).
 * - `rawMessage` preserves a human-readable backend message when present.
 */
export interface AutoCheckinProviderResult<
  TData = unknown,
  TMessageParams extends Record<string, unknown> = Record<string, unknown>,
> {
  status: CheckinResultStatus
  messageKey?: string
  messageParams?: TMessageParams
  rawMessage?: string
  data?: TData
}
