import type { InventorySecretAvailability } from "~/services/apiAdapters/contracts/keyManagement"

export type KeyResourceFact = {
  id: string
  label: string
  value: string
}

export type KeyResourceActionPolicy = {
  copySecret: boolean
  revealSecret: boolean
  verifySecret: boolean
  exportSecret: boolean
  edit: boolean
  delete: boolean
  batchSelect: boolean
}

export type KeyResourceCardPresentation = {
  id: string
  title: string
  accountLabel: string
  status: "active" | "inactive" | "unknown"
  statusLabel: string
  secretAvailability: InventorySecretAvailability
  maskedLabel?: string
  secretAvailabilityMessage?: string
  /** Preferred compact-list context, such as a group or workspace. */
  contextFact?: KeyResourceFact
  summaryFacts: KeyResourceFact[]
  detailFacts: KeyResourceFact[]
  actions: KeyResourceActionPolicy
}

export type KeyResourceDetailState =
  | { status: "ready"; facts: KeyResourceFact[] }
  | { status: "loading" }
  | { status: "error"; message: string; onRetry?: () => void }
