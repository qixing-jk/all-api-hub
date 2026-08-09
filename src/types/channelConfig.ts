import type { ChannelModelFilterRule } from "./channelModelFilters"
import type { ManagedUpstreamResourceRef } from "./managedUpstreamResource"

export interface ChannelModelFilterSettings {
  rules: ChannelModelFilterRule[]
  updatedAt: number
}

export interface ChannelResourceConfig {
  resourceRef: ManagedUpstreamResourceRef
  channelId?: number
  modelFilterSettings: ChannelModelFilterSettings
  createdAt: number
  updatedAt: number
}

export type ChannelResourceConfigMap = Record<string, ChannelResourceConfig>

export const CHANNEL_CONFIG_SNAPSHOT_VERSION = 1 as const

export interface ChannelConfigSnapshot {
  schemaVersion: typeof CHANNEL_CONFIG_SNAPSHOT_VERSION
  configs: ChannelResourceConfigMap
}

/**
 * Creates a default channel configuration with empty model filter rules and current timestamps.
 */
export function createDefaultChannelResourceConfig(
  resourceRef: ManagedUpstreamResourceRef,
  channelId?: number,
): ChannelResourceConfig {
  const timestamp = Date.now()

  return {
    resourceRef,
    ...(channelId !== undefined ? { channelId } : {}),
    modelFilterSettings: {
      rules: [],
      updatedAt: timestamp,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
