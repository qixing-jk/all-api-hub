import type { ChannelFilterRule } from "./channelFilters"

export interface ChannelConfig {
  channelId: number
  filters: ChannelFilterRule[]
  createdAt: number
  updatedAt: number
}

export type ChannelConfigMap = Record<number, ChannelConfig>

export function createDefaultChannelConfig(channelId: number): ChannelConfig {
  const timestamp = Date.now()
  return {
    channelId,
    filters: [],
    createdAt: timestamp,
    updatedAt: timestamp
  }
}
