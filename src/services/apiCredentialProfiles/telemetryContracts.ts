import type {
  ApiCredentialTelemetryBalance,
  ApiCredentialTelemetrySnapshot,
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

export type TelemetryPatch = Partial<
  Pick<
    ApiCredentialTelemetrySnapshot,
    | "balance"
    | "quota"
    | "balanceUsd"
    | "todayCostUsd"
    | "todayRequests"
    | "todayTokens"
    | "unlimitedQuota"
    | "totalUsedUsd"
    | "totalGrantedUsd"
    | "totalAvailableUsd"
    | "expiresAt"
  >
> & {
  /** Provider-native balances when a response contains multiple currencies. */
  balances?: ApiCredentialTelemetryBalance[]
}
