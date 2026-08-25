import type {
  ApiCredentialTelemetryBalance,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"

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
