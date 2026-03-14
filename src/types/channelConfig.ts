import type { ChannelModelFilterRule } from "./channelModelFilters"

export interface ChannelModelFilterSettings {
  rules: ChannelModelFilterRule[]
  updatedAt: number
}

export interface VerificationCredentials {
  baseUrl: string
  apiKey: string
  apiType: string
  sourceProfileId?: string
  updatedAt: number
}

export interface ChannelConfig {
  channelId: number
  modelFilterSettings: ChannelModelFilterSettings
  verificationCredentials?: VerificationCredentials
  createdAt: number
  updatedAt: number
}

export type ChannelConfigMap = Record<number, ChannelConfig>

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
