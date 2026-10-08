import type { ManagedSiteType } from "~/constants/siteType"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import type { ManagedModelChannelListData } from "~/types/managedResourceModels"

/** Fields shared by the native New API, Veloera and DoneHub model workflows. */
interface ChannelModelRecord {
  id: number
  name: string
  type: number | string
  base_url: string
  key?: string
  models?: string | null
  status: number
  model_mapping: string
}

/** Limits model task inventories to their own inputs instead of leaking provider CRUD records. */
export function toManagedModelChannelList(
  list: { items: ChannelModelRecord[]; total: number },
  disabledStatuses: readonly number[],
  target: { siteType: ManagedSiteType; config: { baseUrl: string } },
): ManagedModelChannelListData {
  return {
    total: list.total,
    items: list.items.map((channel) => ({
      ref: createManagedChannelResourceRef(
        target.siteType,
        target.config.baseUrl,
        channel.id,
      ),
      name: channel.name,
      type: channel.type,
      baseUrl: channel.base_url,
      credential: channel.key,
      models: (channel.models ?? "")
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean),
      disabled: disabledStatuses.includes(channel.status),
      modelMapping: channel.model_mapping,
    })),
  }
}

/** Native ids may arrive as numbers or strings; equal ids across adapters are unrelated. */
export function createChannelVerificationProtocolResolver(
  protocols: Readonly<Record<string, ApiVerificationApiType>>,
): (channelType: unknown) => ApiVerificationApiType | null {
  return (channelType) => {
    const rawType =
      typeof channelType === "number" || typeof channelType === "string"
        ? String(channelType).trim()
        : ""
    const type = /^\d+$/.test(rawType) ? String(Number(rawType)) : rawType
    return Object.hasOwn(protocols, type) ? protocols[type] ?? null : null
  }
}
