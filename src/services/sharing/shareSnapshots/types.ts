import { BALANCE_PURPOSES } from "~/services/accounts/metrics/balanceProjection"
import type { Asset } from "~/services/amounts/assets"
import type { Amount, BalancePosition } from "~/services/amounts/balance"
import {
  type FINANCIAL_COVERAGE,
  type SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import {
  type SHARE_SNAPSHOT_EXPORT_METHODS,
  type SHARE_SNAPSHOT_KINDS,
} from "~/services/sharing/shareSnapshots/constants"
import type { CurrencyDisplay, CurrencyType } from "~/types"

/** Public facts only: local account, wallet and restriction IDs never leave the app. */
export interface ShareBalanceEntry {
  asset: Asset
  amount?: Amount
  status: BalancePosition["amount"]["status"]
  role: BalancePosition["role"]
  nature: BalancePosition["nature"]
  funding: BalancePosition["funding"]
  cashClassification: BalancePosition["cashClassification"]
  labelKey?: BalancePosition["labelKey"]
  instrument?: BalancePosition["instrument"]
  relation?: BalancePosition["relation"]
  source: Pick<
    BalancePosition["amount"]["source"],
    "adapter" | "operation" | "contractVersion" | "kind" | "inputs"
  >
  observedAt?: number
  scope: Record<
    "projects" | "keys" | "models" | "groups",
    (typeof SCOPE_SELECTION_KINDS)[keyof typeof SCOPE_SELECTION_KINDS]
  >
  validity: BalancePosition["validity"]
  reportedTiming?: BalancePosition["reportedTiming"]
  window?: BalancePosition["window"]
  allowanceRules?: string[]
}

export const SHARE_BALANCE_PURPOSES = {
  Account: "account",
  Prepaid: BALANCE_PURPOSES.Prepaid,
  Available: BALANCE_PURPOSES.Available,
} as const

export interface ShareBalanceSummary {
  purpose: (typeof SHARE_BALANCE_PURPOSES)[keyof typeof SHARE_BALANCE_PURPOSES]
  entries: ShareBalanceEntry[]
  amounts?: Amount[]
  referenceAmount?: Amount
  lastKnownCount?: number
  usdInCny?: string
  cnyInUsd?: string
  convertedCurrencyTotals?: Partial<Record<CurrencyType, string>>
  coverage: (typeof FINANCIAL_COVERAGE)[keyof typeof FINANCIAL_COVERAGE]
  includedCount?: number
  eligibleCount?: number
  conflictCount?: number
  duplicateCount?: number
  potentialDuplicateCount?: number
  manualCount?: number
}

export type ShareSnapshotKind =
  (typeof SHARE_SNAPSHOT_KINDS)[keyof typeof SHARE_SNAPSHOT_KINDS]

export interface BaseShareSnapshotPayload {
  siteDayUsage?: ReturnType<
    typeof import("./consumptionSummary").publicSiteDayUsage
  >
  todayNetAmount?: Amount
  incomeSummary?: ReturnType<
    typeof import("./consumptionSummary").publicConsumptionSummary
  >
  consumptionSummary?: ReturnType<
    typeof import("./consumptionSummary").publicConsumptionSummary
  >
  kind: ShareSnapshotKind
  currencyType: CurrencyType
  /** Older payloads inherit currencyType; original preserves provider units. */
  currencyDisplay?: CurrencyDisplay
  /** Existing account rate for USD/CNY presentation conversion. */
  exchangeRate?: number
  /**
   * "As of" timestamp in milliseconds since epoch.
   * Always present in snapshots (falls back to export time when unknown).
   */
  asOf: number
  /**
   * Seed used to generate the mesh gradient background.
   */
  backgroundSeed: number
  balanceSummary?: ShareBalanceSummary
}

export interface OverviewShareSnapshotPayload extends BaseShareSnapshotPayload {
  kind: typeof SHARE_SNAPSHOT_KINDS.Overview
  enabledAccountCount: number
  /** @deprecated Unverified legacy input; never rendered as current money. */
  totalBalance?: number
  todayIncome?: number
  todayOutcome?: number
  todayNet?: number
}

export interface AccountShareSnapshotPayload extends BaseShareSnapshotPayload {
  kind: typeof SHARE_SNAPSHOT_KINDS.Account
  siteName: string
  originUrl?: string
  /** @deprecated Unverified legacy input; never rendered as current money. */
  balance?: number
  todayIncome?: number
  todayOutcome?: number
  todayNet?: number
}

export type ShareSnapshotPayload =
  OverviewShareSnapshotPayload | AccountShareSnapshotPayload

export type ShareSnapshotExportMethod =
  (typeof SHARE_SNAPSHOT_EXPORT_METHODS)[keyof typeof SHARE_SNAPSHOT_EXPORT_METHODS]

export interface ShareSnapshotExportResult {
  method: ShareSnapshotExportMethod
  caption: string
  didCopyImage: boolean
  didCopyCaption: boolean
  filename: string
}
