import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type {
  AccountKeyResourceFacts,
  AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"

export const KEY_MANAGEMENT_LOAD_STATUSES = {
  Idle: "idle",
  Loading: "loading",
  Loaded: "loaded",
  Error: "error",
} as const

export type KeyManagementLoadStatus =
  (typeof KEY_MANAGEMENT_LOAD_STATUSES)[keyof typeof KEY_MANAGEMENT_LOAD_STATUSES]

export type ServiceCredentialState = {
  status: KeyManagementLoadStatus
  credential?: AccountServiceCredential
  errorMessage?: string
  isRotating?: boolean
}

export type KeyManagementEntry = {
  id: string
  runtimeKey: AccountRuntimeKey
  uiState: {
    isRotating?: boolean
  }
}

export type ApiCredentialProfileSaveEntry = KeyManagementEntry

export type CliProxyExportEntry = ApiCredentialProfileSaveEntry

export const KEY_MANAGEMENT_DISPLAY_ROW_KINDS = {
  RuntimeKey: "runtime-key",
  AccountKeyResource: "account-key-resource",
} as const

/** A display-only native resource row. It deliberately cannot enter legacy exports. */
export type NativeKeyManagementRow = {
  kind: (typeof KEY_MANAGEMENT_DISPLAY_ROW_KINDS)["AccountKeyResource"]
  /** Local per-load identifier; never derived from a provider resource identifier. */
  rowKey: string
  accountId: string
  accountName: string
  workspaceName: string
  facts: AccountKeyResourceFacts
}

export type KeyManagementDisplayRow =
  | {
      kind: (typeof KEY_MANAGEMENT_DISPLAY_ROW_KINDS)["RuntimeKey"]
      entry: KeyManagementEntry
    }
  | NativeKeyManagementRow

export type NativeKeyManagementRowAction = (ref: AccountKeyResourceRef) => void

/**
 * Counts are nullable because a failed or unresolved inventory cannot prove a
 * complete total. The `known*` fields preserve the usable rows already
 * available.
 */
export type KeyManagementAggregateCounts = {
  total: number | null
  enabled: number | null
  showing: number | null
  knownTotal: number
  knownEnabled: number
  knownShowing: number
}

export type KeyManagementAccountSummaryItem = {
  accountId: string
  name: string
  /** A complete count, or null when the account inventory is incomplete. */
  count: number | null
  /** Rows known despite an incomplete inventory. */
  knownCount?: number
  errorType?: "load-failed" | "unsupported"
}
