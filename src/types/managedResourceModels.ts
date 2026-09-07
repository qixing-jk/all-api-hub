/** Product-owned task input for providers with channel model lists and redirect mappings. */
export interface ManagedModelChannel {
  id: number
  name: string
  type: number | string
  baseUrl: string
  credential?: string
  models: string[]
  /** True only for a provider-declared disabled state; unknown states stay eligible. */
  disabled: boolean
  modelMapping: string
}

export interface ManagedModelChannelListData {
  items: ManagedModelChannel[]
  total: number
}

/** Facts needed to select a channel for model sync, without execution credentials. */
export type ManagedModelChannelSummary = Pick<
  ManagedModelChannel,
  "id" | "name"
>

export interface ManagedModelChannelSummaryListData {
  items: ManagedModelChannelSummary[]
  total: number
}

/** Safe input for the redirect-mapping preview and selection UI. */
export type ManagedModelMappingPreview = Pick<
  ManagedModelChannel,
  "id" | "name" | "modelMapping"
>
