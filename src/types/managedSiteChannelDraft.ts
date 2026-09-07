/** Resolved credential values needed to prepare a managed-resource import. */
export interface ManagedSiteChannelDraftSource {
  name: string
  baseUrl: string
  apiKey: string
  /** Existing source model hints; each destination decides whether to use them. */
  modelHints: readonly string[]
}

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
