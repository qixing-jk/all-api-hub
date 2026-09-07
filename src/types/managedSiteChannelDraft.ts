import type { ChannelStatus } from "~/types/newApi"

/** Product-owned input for importing a credential into a native resource editor. */
export interface ManagedSiteChannelDraft {
  name: string
  type: string | number
  key: string
  base_url: string
  models: string[]
  modelPrefillFetchFailed?: boolean
  groups: string[]
  priority: number
  weight: number
  status: ChannelStatus
  /** Provider-native notes carried by import drafts when supported. */
  notes?: string
}

/** Shared import defaults; each provider owns its native payload conversion. */
export type ManagedSiteChannelDraftDefaults = Pick<
  ManagedSiteChannelDraft,
  "type" | "status" | "priority" | "weight" | "groups" | "models"
>
