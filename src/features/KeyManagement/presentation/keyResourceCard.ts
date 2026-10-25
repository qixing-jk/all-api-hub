import type { ComponentProps } from "react"

import type { Badge } from "~/components/ui/badge"
import type { InventorySecretAvailability } from "~/services/apiAdapters/contracts/inventorySecret"

export type KeyResourceFact = {
  id: string
  label: string
  value: string
}

/** Highlighted metadata shown next to the key status, never a plain fact. */
export type KeyResourceBadge = {
  id: string
  label: string
  variant?: NonNullable<ComponentProps<typeof Badge>["variant"]>
  /** Explains the badge on hover; the label alone stays short. */
  title?: string
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
  /** Provider-declared highlights, rendered beside the status. */
  badges?: readonly KeyResourceBadge[]
  summaryFacts: KeyResourceFact[]
  /** Complete inventories supply only facts not already allocated to the summary. */
  detailFacts: KeyResourceFact[]
  actions: KeyResourceActionPolicy
}

export type KeyResourceDetailState =
  | { status: "ready"; facts: KeyResourceFact[] }
  | { status: "loading" }
  | { status: "error"; message: string; onRetry?: () => void }
