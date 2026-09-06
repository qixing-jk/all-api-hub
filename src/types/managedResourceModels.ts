import type { OctopusChannel } from "./octopus"

/** Model-task inputs shared by supported providers, without a New API CRUD payload. */
export interface ManagedModelChannel {
  id: number
  name: string
  type: number | string
  base_url: string
  key?: string
  models: string
  status: number
  model_mapping: string
  native?: { kind: "octopus"; data: OctopusChannel }
}

export interface ManagedModelChannelListData {
  items: ManagedModelChannel[]
  total: number
  type_counts: Record<string, number>
}
