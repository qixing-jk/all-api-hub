import { nanoid } from "nanoid"

import { Storage } from "@plasmohq/storage"

import {
  createDefaultChannelConfig,
  type ChannelConfig,
  type ChannelConfigMap
} from "~/types/channelConfig"
import type {
  ChannelFilterInput,
  ChannelFilterRule
} from "~/types/channelFilters"
import { getErrorMessage } from "~/utils/error"

const STORAGE_KEYS = {
  CHANNEL_CONFIGS: "channel_configs"
} as const

class ChannelConfigStorage {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local"
    })
  }

  async getAllConfigs(): Promise<ChannelConfigMap> {
    try {
      const stored = (await this.storage.get(STORAGE_KEYS.CHANNEL_CONFIGS)) as
        | ChannelConfigMap
        | undefined
      return stored ?? {}
    } catch (error) {
      console.error("[ChannelConfig] Failed to load configs:", error)
      return {}
    }
  }

  async getConfig(channelId: number): Promise<ChannelConfig> {
    const configs = await this.getAllConfigs()
    return configs[channelId] ?? createDefaultChannelConfig(channelId)
  }

  async saveConfig(config: ChannelConfig): Promise<boolean> {
    try {
      const configs = await this.getAllConfigs()
      const next: ChannelConfigMap = {
        ...configs,
        [config.channelId]: {
          ...config,
          updatedAt: Date.now()
        }
      }
      await this.storage.set(STORAGE_KEYS.CHANNEL_CONFIGS, next)
      return true
    } catch (error) {
      console.error("[ChannelConfig] Failed to save config:", error)
      return false
    }
  }

  async upsertFilters(
    channelId: number,
    filters: ChannelConfig["filters"]
  ): Promise<boolean> {
    const timestamp = Date.now()
    const current = await this.getConfig(channelId)
    const updated: ChannelConfig = {
      ...current,
      filters,
      channelId,
      updatedAt: timestamp,
      createdAt: current.createdAt || timestamp
    }
    return this.saveConfig(updated)
  }
}

export const channelConfigStorage = new ChannelConfigStorage()

type IncomingChannelFilter = ChannelFilterInput & {
  id?: string
  createdAt?: number
  updatedAt?: number
}

function normalizeFilters(
  filters: IncomingChannelFilter[]
): ChannelFilterRule[] {
  if (!Array.isArray(filters)) {
    throw new Error("Filters must be an array")
  }

  const now = Date.now()

  return filters.map((filter) => {
    const name = (filter.name ?? "").trim()
    if (!name) {
      throw new Error("Filter name is required")
    }

    const pattern = (filter.pattern ?? "").trim()
    if (!pattern) {
      throw new Error("Filter pattern is required")
    }

    if (filter.isRegex) {
      try {
        new RegExp(pattern)
      } catch (error) {
        throw new Error(`Invalid regex pattern: ${(error as Error).message}`)
      }
    }

    const description = filter.description?.trim()
    const createdAt =
      typeof filter.createdAt === "number" && filter.createdAt > 0
        ? filter.createdAt
        : now

    return {
      id: (filter.id ?? "").trim() || nanoid(),
      name,
      description: description || undefined,
      pattern,
      isRegex: Boolean(filter.isRegex),
      action: filter.action === "exclude" ? "exclude" : "include",
      enabled: filter.enabled !== false,
      createdAt,
      updatedAt: now
    }
  })
}

export async function handleChannelConfigMessage(
  request: any,
  sendResponse: (response: any) => void
) {
  try {
    switch (request.action) {
      case "channelConfig:get": {
        const channelId = Number(request.channelId)
        if (!Number.isFinite(channelId) || channelId <= 0) {
          throw new Error("channelId is required")
        }

        const config = await channelConfigStorage.getConfig(channelId)
        sendResponse({ success: true, data: config })
        break
      }

      case "channelConfig:upsertFilters": {
        const channelId = Number(request.channelId)
        if (!Number.isFinite(channelId) || channelId <= 0) {
          throw new Error("channelId is required")
        }

        const normalizedFilters = normalizeFilters(request.filters ?? [])
        const success = await channelConfigStorage.upsertFilters(
          channelId,
          normalizedFilters
        )

        if (!success) {
          throw new Error("Failed to save channel filters")
        }

        sendResponse({ success: true, data: normalizedFilters })
        break
      }

      default: {
        sendResponse({ success: false, error: "Unknown action" })
      }
    }
  } catch (error) {
    console.error("[ChannelConfig] Message handling failed:", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
