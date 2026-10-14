import type { KeyMaskEvidence } from "~/services/accountTokens/keyMaskEvidence"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"

/** Native resource facts needed for duplicate and token-status matching. */
export interface ManagedResourceMatchCandidate {
  ref: ManagedResourceRef
  name: string
  type: number | string
  base_url: string
  models: string
  key?: string
  /** Complete native key-pool identities; absent means the inventory cannot prove membership. */
  keyIdentities?: readonly string[]
  /** Confirmed anchored masks for the COMPLETE key pool; omit for samples or unknown formats. */
  keyMasks?: readonly KeyMaskEvidence[]
}
export interface ManagedResourceMatchList {
  items: ManagedResourceMatchCandidate[]
  total: number
  type_counts: Record<string, number>
}
