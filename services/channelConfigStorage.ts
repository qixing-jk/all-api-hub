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

/**
 * Normalize inbound filter payloads and ensure required fields are present.
 * Validates names/patterns and fills defaults for IDs and timestamps.
 * @param filters Incoming filter definitions from the UI or message bus.
 * @throws {Error} When required fields are missing or regex is invalid.
 * @returns Sanitized filter rules ready for persistence.
 */
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

/**
 * Handle runtime messages related to channel configuration CRUD operations.
 * Supports fetching configs and upserting filter rules.
 * @param request Message payload containing action and arguments.
 * @param sendResponse Response callback for the runtime message.
 */
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

/**
 * Sanitize the raw config map received from import or storage.
 * Ensures keys are valid numeric channel IDs and values are cleaned configs.
 * @param rawConfigs Arbitrary raw object to be parsed as channel config map.
 * @returns Clean ChannelConfigMap keyed by channelId.
 */
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

/**
 * Sanitize a single channel config entry into the expected structure.
 * Applies default timestamps and cleans nested filter settings.
 * @param value Raw config object.
 * @param channelId Channel identifier for the config.
 * @returns Sanitized ChannelConfig.
 */
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

/**
 * Sanitize filter settings including legacy filter arrays.
 * Converts raw rule entries into validated ChannelModelFilterRule items.
 * @param rawSettings Current stored settings with potential partial data.
 * @param legacyFilters Legacy filters array to migrate if rules are absent.
 * @param fallbackTimestamp Timestamp used when rule timestamps are missing.
 * @returns Clean ChannelModelFilterSettings with validated rules.
 */
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

/**
 * Sanitize a single filter entry ensuring required fields and defaults.
 * Invalid or incomplete entries return null to be filtered out by callers.
 * @param filter Raw filter object.
 * @param fallbackTimestamp Timestamp used when per-rule timestamps are absent.
 * @returns Valid ChannelModelFilterRule or null when validation fails.
 */
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
