import type { ChannelModelFilterRule } from "./channelModelFilters"
import type { ManagedUpstreamResourceRef } from "./managedUpstreamResource"

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

export interface ChannelResourceConfig {
  resourceRef: ManagedUpstreamResourceRef
  channelId?: number
  modelFilterSettings: ChannelModelFilterSettings
  createdAt: number
  updatedAt: number
}

export type ChannelResourceConfigMap = Record<string, ChannelResourceConfig>

/**
 * Creates a default channel configuration with empty model filter rules and current timestamps.
 */
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

/**
 * Creates a default resource-keyed channel configuration with empty model filter rules.
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
