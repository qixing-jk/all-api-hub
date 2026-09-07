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
  enabled: boolean
  /** Provider-native notes carried by import drafts when supported. */
  notes?: string
}

/** Shared import defaults; each provider owns its native payload conversion. */
export type ManagedSiteChannelDraftDefaults = Pick<
  ManagedSiteChannelDraft,
  "enabled" | "priority" | "weight" | "groups" | "models"
>
