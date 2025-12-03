import { nanoid } from "nanoid"

import { Storage } from "@plasmohq/storage"

import {
  createDefaultChannelConfig,
  type ChannelConfig,
  type ChannelConfigMap,
  type ChannelModelFilterSettings,
} from "~/types/channelConfig"
import type {
  ChannelModelFilterInput,
  ChannelModelFilterRule,
} from "~/types/channelModelFilters"
import { getErrorMessage } from "~/utils/error"

const STORAGE_KEYS = {
  CHANNEL_CONFIGS: "channel_configs",
} as const

class ChannelConfigStorage {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
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
          updatedAt: Date.now(),
        },
      }
      await this.storage.set(STORAGE_KEYS.CHANNEL_CONFIGS, next)
      return true
    } catch (error) {
      console.error("[ChannelConfig] Failed to save config:", error)
      return false
    }
  }

  async exportConfigs(): Promise<ChannelConfigMap> {
    return this.getAllConfigs()
  }

  async importConfigs(rawConfigs: unknown): Promise<number> {
    const sanitized = sanitizeChannelConfigMap(rawConfigs)
    await this.storage.set(STORAGE_KEYS.CHANNEL_CONFIGS, sanitized)
    return Object.keys(sanitized).length
  }

  async upsertFilters(
    channelId: number,
    rules: ChannelModelFilterRule[],
  ): Promise<boolean> {
    const timestamp = Date.now()
    const current = await this.getConfig(channelId)
    const previousSettings =
      current.modelFilterSettings ??
      createDefaultChannelConfig(channelId).modelFilterSettings

    const updated: ChannelConfig = {
      ...current,
      channelId,
      modelFilterSettings: {
        ...previousSettings,
        rules,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
      createdAt: current.createdAt || timestamp,
    }

    return this.saveConfig(updated)
  }
}

export const channelConfigStorage = new ChannelConfigStorage()

type IncomingChannelFilter = ChannelModelFilterInput & {
  id?: string
  createdAt?: number
  updatedAt?: number
}

function normalizeFilters(
  filters: IncomingChannelFilter[],
): ChannelModelFilterRule[] {
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
      updatedAt: now,
    }
  })
}

export async function handleChannelConfigMessage(
  request: any,
  sendResponse: (response: any) => void,
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
          normalizedFilters,
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

function sanitizeChannelConfigMap(rawConfigs: unknown): ChannelConfigMap {
  if (!rawConfigs || typeof rawConfigs !== "object") {
    return {}
  }

  const entries = Object.entries(rawConfigs as Record<string, unknown>)
  return entries.reduce<ChannelConfigMap>((acc, [key, value]) => {
    const channelId = Number(key)
    if (!Number.isFinite(channelId) || channelId <= 0) {
      return acc
    }

    acc[channelId] = sanitizeChannelConfig(value, channelId)
    return acc
  }, {})
}

function sanitizeChannelConfig(
  value: unknown,
  channelId: number,
): ChannelConfig {
  const timestamp = Date.now()
  const payload = (value ?? {}) as Partial<ChannelConfig> & {
    filters?: unknown
    modelFilterSettings?: Partial<ChannelModelFilterSettings> & {
      rules?: unknown
    }
  }

  const modelFilterSettings = sanitizeModelFilterSettings(
    payload.modelFilterSettings,
    payload.filters,
    timestamp,
  )

  return {
    channelId,
    modelFilterSettings,
    createdAt:
      typeof payload.createdAt === "number" && payload.createdAt > 0
        ? payload.createdAt
        : timestamp,
    updatedAt:
      typeof payload.updatedAt === "number" && payload.updatedAt > 0
        ? payload.updatedAt
        : modelFilterSettings.updatedAt,
  }
}

function sanitizeModelFilterSettings(
  rawSettings:
    | (Partial<ChannelModelFilterSettings> & { rules?: unknown })
    | undefined,
  legacyFilters: unknown,
  fallbackTimestamp: number,
): ChannelModelFilterSettings {
  if (rawSettings && typeof rawSettings === "object") {
    const rules = Array.isArray(rawSettings.rules)
      ? rawSettings.rules
          .map((filter) => sanitizeFilter(filter, fallbackTimestamp))
          .filter((filter): filter is ChannelModelFilterRule => Boolean(filter))
      : []

    const updatedAt =
      typeof rawSettings.updatedAt === "number" && rawSettings.updatedAt > 0
        ? rawSettings.updatedAt
        : fallbackTimestamp

    return {
      rules,
      updatedAt,
    }
  }

  const legacyRules = Array.isArray(legacyFilters)
    ? legacyFilters
        .map((filter) => sanitizeFilter(filter, fallbackTimestamp))
        .filter((filter): filter is ChannelModelFilterRule => Boolean(filter))
    : []

  return {
    rules: legacyRules,
    updatedAt: fallbackTimestamp,
  }
}

function sanitizeFilter(
  filter: unknown,
  fallbackTimestamp: number,
): ChannelModelFilterRule | null {
  if (!filter || typeof filter !== "object") {
    return null
  }

  const payload = filter as Partial<ChannelModelFilterRule>
  const name = typeof payload.name === "string" ? payload.name.trim() : ""
  const pattern =
    typeof payload.pattern === "string" ? payload.pattern.trim() : ""

  if (!name || !pattern) {
    return null
  }

  const description =
    typeof payload.description === "string" && payload.description.trim()
      ? payload.description.trim()
      : undefined

  return {
    id:
      typeof payload.id === "string" && payload.id.trim()
        ? payload.id.trim()
        : nanoid(),
    name,
    description,
    pattern,
    isRegex: Boolean(payload.isRegex),
    action: payload.action === "exclude" ? "exclude" : "include",
    enabled: payload.enabled !== false,
    createdAt:
      typeof payload.createdAt === "number" && payload.createdAt > 0
        ? payload.createdAt
        : fallbackTimestamp,
    updatedAt:
      typeof payload.updatedAt === "number" && payload.updatedAt > 0
        ? payload.updatedAt
        : fallbackTimestamp,
  }
}
