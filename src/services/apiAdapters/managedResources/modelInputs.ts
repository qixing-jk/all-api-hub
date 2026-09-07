import type { ManagedModelChannelListData } from "~/types/managedResourceModels"

/** Fields shared by the native New API, Veloera and DoneHub model workflows. */
interface ChannelModelRecord {
  id: number
  name: string
  type: number | string
  base_url: string
  key?: string
  models: string
  status: number
  model_mapping: string
}

/** Limits model task inventories to their own inputs instead of leaking provider CRUD records. */
export function toManagedModelChannelList(
  list: { items: ChannelModelRecord[]; total: number },
  disabledStatuses: readonly number[],
): ManagedModelChannelListData {
  return {
    total: list.total,
    items: list.items.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      baseUrl: channel.base_url,
      credential: channel.key,
      models: channel.models
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean),
      disabled: disabledStatuses.includes(channel.status),
      modelMapping: channel.model_mapping,
    })),
  }
}
