import type { CurrencyType } from "~/types"

export type ShareSnapshotKind = "overview" | "account"

export interface BaseShareSnapshotPayload {
  kind: ShareSnapshotKind
  currencyType: CurrencyType
  /**
   * "As of" timestamp in milliseconds since epoch.
   * Always present in snapshots (falls back to export time when unknown).
   */
  asOf: number
  /**
   * Seed used to generate the mesh gradient background.
   */
  backgroundSeed: number
}

export interface OverviewShareSnapshotPayload extends BaseShareSnapshotPayload {
  kind: "overview"
  enabledAccountCount: number
  totalBalance: number
  todayIncome?: number
  todayOutcome?: number
  todayNet?: number
}

export interface AccountShareSnapshotPayload extends BaseShareSnapshotPayload {
  kind: "account"
  siteName: string
  originUrl?: string
  balance: number
  todayIncome?: number
  todayOutcome?: number
  todayNet?: number
}

export type ShareSnapshotPayload =
  | OverviewShareSnapshotPayload
  | AccountShareSnapshotPayload

export type ShareSnapshotExportMethod = "clipboard" | "download"

export interface ShareSnapshotExportResult {
  method: ShareSnapshotExportMethod
  caption: string
  didCopyImage: boolean
  didCopyCaption: boolean
  filename: string
}
