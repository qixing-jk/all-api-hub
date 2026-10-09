import type { ChannelModelFilterRule } from "./channelModelFilters"
import type { ManagedUpstreamResourceRef } from "./managedUpstreamResource"

export interface ChannelModelFilterSettings {
  rules: ChannelModelFilterRule[]
  updatedAt: number
  /** Exclusion-only entries have not chosen filters; absence preserves older configured entries. */
  configured?: false
}

export interface ChannelResourceConfig {
  resourceRef: ManagedUpstreamResourceRef
  channelId?: number
  /** Skip automatic/full model sync; explicit resource selections may still run. */
  modelSyncExcluded?: boolean
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
