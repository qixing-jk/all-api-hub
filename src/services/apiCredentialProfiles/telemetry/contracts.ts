import type {
  ApiCredentialTelemetryBalance,
  ApiCredentialTelemetryQuota,
  ApiCredentialTelemetryTokenUsage,
} from "~/types/apiCredentialProfiles"

/** Provider protocol values shared by telemetry adapters and parsers. */
export const TELEMETRY_PROVIDER_PROTOCOL = {
  currencies: { Cny: "CNY", Usd: "USD", Jpy: "JPY" },
  glm: {
    limitTypes: {
      Tokens: "TOKENS_LIMIT",
      Credits: "CREDIT_LIMIT",
      Time: "TIME_LIMIT",
    },
    fiveHourUnit: 3,
    fiveHourNumber: 5,
    weeklyUnit: 6,
  },
  kimi: {
    fiveHourDurationMinutes: 300,
    boosterStatuses: ["STATUS_ACTIVE", "STATUS_ENABLED"] as const,
    boosterCreditsPerUnit: 100_000_000,
    moonshotAiHost: "api.moonshot.ai",
  },
  openCodeGo: {
    usageStatus: "ok",
    windows: ["rolling", "weekly", "monthly"] as const,
  },
} as const

/**
 * Ephemeral adapter output consumed by telemetry fact normalization.
 *
 * This shape is never persisted directly. Its flat fields describe the
 * provider observations available at the adapter seam; snapshot persistence
 * uses the unit-aware `facts` model instead.
 */
export type TelemetryPatch = {
  /** Provider-native balance when the response contains one currency. */
  balance?: ApiCredentialTelemetryBalance
  /** Provider-native balances when a response contains multiple currencies. */
  balances?: ApiCredentialTelemetryBalance[]
  /** Provider-native quota windows normalized to remaining capacity. */
  quota?: ApiCredentialTelemetryQuota
  /** USD-denominated or USD-equivalent balance reported by the adapter. */
  balanceUsd?: number
  /** USD-denominated cost accumulated today. */
  todayCostUsd?: number
  todayRequests?: number
  todayTokens?: ApiCredentialTelemetryTokenUsage
  unlimitedQuota?: boolean
  /** USD-denominated or USD-equivalent cumulative usage. */
  totalUsedUsd?: number
  /** USD-denominated or USD-equivalent cumulative grant. */
  totalGrantedUsd?: number
  /** USD-denominated or USD-equivalent cumulative availability. */
  totalAvailableUsd?: number
  expiresAt?: number
}
