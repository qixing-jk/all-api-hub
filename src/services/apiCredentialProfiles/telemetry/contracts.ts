import { CURRENCIES } from "~/constants/money"
import type { Asset } from "~/services/amounts/assets"
import type { EvidenceRef } from "~/services/amounts/balance"
import type { BudgetWindow } from "~/services/amounts/budgets"
import { type FINANCIAL_COVERAGE } from "~/services/amounts/financialConstants"
import type {
  ApiCredentialTelemetryBalance,
  ApiCredentialTelemetryFinancialMapping,
  ApiCredentialTelemetryQuota,
  ApiCredentialTelemetryTokenUsage,
} from "~/types/apiCredentialProfiles"

/** Provider protocol values shared by telemetry adapters and parsers. */
export const TELEMETRY_PROVIDER_PROTOCOL = {
  currencies: { Cny: CURRENCIES.CNY, Usd: CURRENCIES.USD, Jpy: "JPY" },
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
  kimiInference?: { payload: unknown; currency: "CNY" | "USD" }
  availability?: boolean
  budget?: {
    asset: Asset
    source?: EvidenceRef
    limit?: unknown
    used?: unknown
    remaining?: unknown
    unlimited?: boolean
    remainingDerived?: boolean
    window?: BudgetWindow
  }

  /** User-confirmed meaning of custom financial paths. */
  financialMapping?: ApiCredentialTelemetryFinancialMapping
  balanceAsset?: Asset
  balanceCoverage?: (typeof FINANCIAL_COVERAGE)[keyof typeof FINANCIAL_COVERAGE]
  /** Provider-native balance when the response contains one currency. */
  balance?: ApiCredentialTelemetryBalance
  /** Provider-native balances when a response contains multiple currencies. */
  balances?: ApiCredentialTelemetryBalance[]
  /** Provider-native quota windows normalized to remaining capacity. */
  quota?: ApiCredentialTelemetryQuota
  /** Legacy path name; the field alone establishes neither asset nor role. */
  balanceUsd?: number | string
  /** Today's cost; its asset is known only through an explicit mapping. */
  todayCostUsd?: number | string
  todayRequests?: number
  todayTokens?: ApiCredentialTelemetryTokenUsage
  unlimitedQuota?: boolean
  /** Cumulative usage in the mapped asset, otherwise unverified. */
  totalUsedUsd?: number | string
  /** Mapped budget limit or legacy grant observation. */
  totalGrantedUsd?: number | string
  /** Availability in the mapped asset, otherwise unverified. */
  totalAvailableUsd?: number | string
  expiresAt?: number
}
