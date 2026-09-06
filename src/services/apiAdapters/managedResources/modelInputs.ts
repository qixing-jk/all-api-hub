import type {
  ManagedModelChannel,
  ManagedModelChannelListData,
} from "~/types/managedResourceModels"
import type { OctopusChannel } from "~/types/octopus"

/** Limits model task inventories to their own inputs instead of leaking provider CRUD records. */
export function toManagedModelChannelList(
  list: ManagedModelChannelListData,
): ManagedModelChannelListData {
  return {
    total: list.total,
    type_counts: list.type_counts,
    items: list.items.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      base_url: channel.base_url,
      key: channel.key,
      models: channel.models,
      status: channel.status,
      model_mapping: channel.model_mapping,
      ...(channel.native ? { native: channel.native } : {}),
    })),
  }
}

/** Keeps native Octopus settings available to its model-probe implementation. */
export function toOctopusModelChannel(
  channel: OctopusChannel,
): ManagedModelChannel {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    base_url: channel.base_urls[0]?.url ?? "",
    key: channel.keys[0]?.channel_key ?? "",
    models: channel.model ?? "",
    status: channel.enabled ? 1 : 2,
    model_mapping: "",
    native: { kind: "octopus", data: channel },
  }
}
