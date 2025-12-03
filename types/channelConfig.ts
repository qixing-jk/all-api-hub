import type { ChannelModelFilterRule } from "./channelModelFilters"

export interface ChannelModelFilterSettings {
  rules: ChannelModelFilterRule[]
  updatedAt: number
}

export interface ChannelConfig {
  channelId: number
  modelFilterSettings: ChannelModelFilterSettings
  createdAt: number
  updatedAt: number
}

export type ChannelConfigMap = Record<number, ChannelConfig>

export function createDefaultChannelConfig(channelId: number): ChannelConfig {
  const timestamp = Date.now()

  return {
    channelId,
    modelFilterSettings: {
      rules: [],
      updatedAt: timestamp,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
