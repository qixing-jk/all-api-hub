import { Storage } from "@plasmohq/storage"

import {
  STORAGE_LOCKS,
  WEB_AI_API_CHECK_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT } from "~/services/verification/webAiApiCheck/constants"
import { normalizeOpenAiFamilyBaseUrl } from "~/services/verification/webAiApiCheck/extractCredentials"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("WebAiApiCheckBaseUrlHistory")

const STORE_VERSION = 1
const MAX_HISTORY_ENTRIES = 20
const MAX_SOURCE_ORIGINS_PER_ENTRY = 8
const MAX_SUGGESTION_LIMIT = 10
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export type WebAiApiCheckBaseUrlHistorySourceStats = {
  lastUsedAt: number
  useCount: number
}

export type WebAiApiCheckBaseUrlHistoryEntry = {
  baseUrl: string
  lastUsedAt: number
  useCount: number
  sourceOrigins: Record<string, WebAiApiCheckBaseUrlHistorySourceStats>
}

export type WebAiApiCheckBaseUrlHistoryStore = {
  version: number
  entries: WebAiApiCheckBaseUrlHistoryEntry[]
  lastUpdated: number
}

export type WebAiApiCheckBaseUrlSuggestion = {
  baseUrl: string
  lastUsedAt: number
  useCount: number
  matchedSourceOrigin?: string
}

/**
 * Creates an empty history payload with the current supported schema version.
 */
function createDefaultStore(
  now = Date.now(),
): WebAiApiCheckBaseUrlHistoryStore {
  return {
    version: STORE_VERSION,
    entries: [],
    lastUpdated: now,
  }
}

/**
 * Normalizes user-entered API URLs to the same OpenAI-family base used by probes.
 */
function normalizeBaseUrlForHistory(baseUrl: string): string | null {
  return normalizeOpenAiFamilyBaseUrl(baseUrl)
}

/**
 * Extracts a privacy-safe source key without preserving paths, query, or hash.
 */
function extractSourceOrigin(pageUrl?: string): string | undefined {
  const raw = pageUrl?.trim()
  if (!raw) return undefined

  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.origin
  } catch {
    return undefined
  }
}

/**
 * Accepts only positive finite timestamps and counters from persisted payloads.
 */
function coercePositiveInteger(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null
  const value = Math.trunc(raw)
  return value > 0 ? value : null
}

/**
 * Keeps only the most recent source-origin buckets for a single Base URL.
 */
function limitSourceOriginsByRecency(
  sourceOrigins: Record<string, WebAiApiCheckBaseUrlHistorySourceStats>,
): Record<string, WebAiApiCheckBaseUrlHistorySourceStats> {
  return Object.fromEntries(
    Object.entries(sourceOrigins)
      .sort((a, b) => b[1].lastUsedAt - a[1].lastUsedAt)
      .slice(0, MAX_SOURCE_ORIGINS_PER_ENTRY),
  )
}

/**
 * Normalizes per-origin usage buckets and drops malformed or over-limit entries.
 */
function coerceSourceOrigins(
  raw: unknown,
): Record<string, WebAiApiCheckBaseUrlHistorySourceStats> {
  if (!raw || typeof raw !== "object") return {}

  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([origin, value]) => {
      const normalizedOrigin = extractSourceOrigin(origin)
      if (!normalizedOrigin || !value || typeof value !== "object") {
        return null
      }

      const stats = value as Record<string, unknown>
      const lastUsedAt = coercePositiveInteger(stats.lastUsedAt)
      const useCount = coercePositiveInteger(stats.useCount)
      if (!lastUsedAt || !useCount) return null

      return [normalizedOrigin, { lastUsedAt, useCount }] as const
    })
    .filter(
      (
        item,
      ): item is readonly [string, WebAiApiCheckBaseUrlHistorySourceStats] =>
        item !== null,
    )

  return limitSourceOriginsByRecency(Object.fromEntries(entries))
}

/**
 * Coerces persisted history into a bounded, deduplicated, privacy-safe store.
 */
export function coerceWebAiApiCheckBaseUrlHistoryStore(
  raw: unknown,
  options?: { now?: number },
): WebAiApiCheckBaseUrlHistoryStore {
  const now = options?.now ?? Date.now()
  const obj = raw && typeof raw === "object" ? (raw as any) : {}
  const entries = Array.isArray(obj.entries) ? obj.entries : []

  const deduped = new Map<string, WebAiApiCheckBaseUrlHistoryEntry>()
  for (const item of entries) {
    if (!item || typeof item !== "object") continue
    const candidate = item as Record<string, unknown>
    const baseUrl =
      typeof candidate.baseUrl === "string"
        ? normalizeBaseUrlForHistory(candidate.baseUrl)
        : null
    if (!baseUrl) continue

    const lastUsedAt = coercePositiveInteger(candidate.lastUsedAt) ?? now
    const useCount = coercePositiveInteger(candidate.useCount) ?? 1
    const sourceOrigins = coerceSourceOrigins(candidate.sourceOrigins)
    const next = {
      baseUrl,
      lastUsedAt,
      useCount,
      sourceOrigins,
    }
    const existing = deduped.get(baseUrl)
    deduped.set(
      baseUrl,
      existing && existing.lastUsedAt > next.lastUsedAt ? existing : next,
    )
  }

  return {
    version: STORE_VERSION,
    entries: Array.from(deduped.values())
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, MAX_HISTORY_ENTRIES),
    lastUpdated: coercePositiveInteger(obj.lastUpdated) ?? now,
  }
}

/**
 * Scores candidates by current source affinity first, then global frequency and recency.
 */
function rankSuggestions(params: {
  entries: WebAiApiCheckBaseUrlHistoryEntry[]
  sourceOrigin?: string
  now: number
}): WebAiApiCheckBaseUrlSuggestion[] {
  return params.entries
    .map((entry) => {
      const sourceStats = params.sourceOrigin
        ? entry.sourceOrigins[params.sourceOrigin]
        : undefined
      const recencyScore = Math.max(
        0,
        RECENCY_WINDOW_MS - (params.now - entry.lastUsedAt),
      )
      const score =
        (sourceStats ? 1_000_000 : 0) +
        (sourceStats?.useCount ?? 0) * 1_000 +
        entry.useCount * 100 +
        recencyScore / 1_000_000

      return {
        suggestion: {
          baseUrl: entry.baseUrl,
          lastUsedAt: entry.lastUsedAt,
          useCount: entry.useCount,
          ...(sourceStats && params.sourceOrigin
            ? { matchedSourceOrigin: params.sourceOrigin }
            : {}),
        },
        score,
      }
    })
    .sort(
      (a, b) =>
        b.score - a.score || b.suggestion.lastUsedAt - a.suggestion.lastUsedAt,
    )
    .map((item) => item.suggestion)
}

class WebAiApiCheckBaseUrlHistoryStorageService {
  private storage = new Storage({ area: "local" })

  private async withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    return withExtensionStorageWriteLock(STORAGE_LOCKS.WEB_AI_API_CHECK, work)
  }

  private async readStore(options?: {
    now?: number
  }): Promise<WebAiApiCheckBaseUrlHistoryStore> {
    const raw = await this.storage.get(
      WEB_AI_API_CHECK_STORAGE_KEYS.BASE_URL_HISTORY,
    )
    return coerceWebAiApiCheckBaseUrlHistoryStore(raw, options)
  }

  async getStore(): Promise<WebAiApiCheckBaseUrlHistoryStore> {
    try {
      return await this.readStore()
    } catch (error) {
      logger.error("Failed to load Web AI API Check Base URL history", error)
      return createDefaultStore()
    }
  }

  async getSuggestions(params?: {
    pageUrl?: string
    limit?: number
  }): Promise<WebAiApiCheckBaseUrlSuggestion[]> {
    const store = await this.getStore()
    const sourceOrigin = extractSourceOrigin(params?.pageUrl)
    const limit = Math.max(
      1,
      Math.min(
        params?.limit ?? WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT,
        MAX_SUGGESTION_LIMIT,
      ),
    )
    return rankSuggestions({
      entries: store.entries,
      sourceOrigin,
      now: Date.now(),
    }).slice(0, limit)
  }

  async recordUse(params: {
    baseUrl: string
    pageUrl?: string
  }): Promise<WebAiApiCheckBaseUrlHistoryStore> {
    const normalizedBaseUrl = normalizeBaseUrlForHistory(params.baseUrl)
    if (!normalizedBaseUrl) {
      return this.getStore()
    }

    return this.withStorageWriteLock(async () => {
      const now = Date.now()
      const sourceOrigin = extractSourceOrigin(params.pageUrl)
      const store = await this.readStore({ now })
      const existing = store.entries.find(
        (entry) => entry.baseUrl === normalizedBaseUrl,
      )
      const sourceOrigins = { ...(existing?.sourceOrigins ?? {}) }

      if (sourceOrigin) {
        const sourceStats = sourceOrigins[sourceOrigin]
        sourceOrigins[sourceOrigin] = {
          lastUsedAt: now,
          useCount: (sourceStats?.useCount ?? 0) + 1,
        }
      }

      const nextEntry: WebAiApiCheckBaseUrlHistoryEntry = {
        baseUrl: normalizedBaseUrl,
        lastUsedAt: now,
        useCount: (existing?.useCount ?? 0) + 1,
        sourceOrigins: limitSourceOriginsByRecency(sourceOrigins),
      }

      const next: WebAiApiCheckBaseUrlHistoryStore = {
        version: STORE_VERSION,
        entries: [
          nextEntry,
          ...store.entries.filter(
            (entry) => entry.baseUrl !== normalizedBaseUrl,
          ),
        ]
          .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
          .slice(0, MAX_HISTORY_ENTRIES),
        lastUpdated: now,
      }

      await this.storage.set(
        WEB_AI_API_CHECK_STORAGE_KEYS.BASE_URL_HISTORY,
        next,
      )
      return next
    })
  }

  async removeBaseUrl(params: {
    baseUrl: string
  }): Promise<WebAiApiCheckBaseUrlHistoryStore> {
    const normalizedBaseUrl = normalizeBaseUrlForHistory(params.baseUrl)
    if (!normalizedBaseUrl) {
      return this.getStore()
    }

    return this.withStorageWriteLock(async () => {
      const now = Date.now()
      const store = await this.readStore({ now })
      const next: WebAiApiCheckBaseUrlHistoryStore = {
        version: STORE_VERSION,
        entries: store.entries.filter(
          (entry) => entry.baseUrl !== normalizedBaseUrl,
        ),
        lastUpdated: now,
      }

      await this.storage.set(
        WEB_AI_API_CHECK_STORAGE_KEYS.BASE_URL_HISTORY,
        next,
      )
      return next
    })
  }

  async clearAllData(): Promise<void> {
    await this.storage.remove(WEB_AI_API_CHECK_STORAGE_KEYS.BASE_URL_HISTORY)
  }
}

export const webAiApiCheckBaseUrlHistoryStorage =
  new WebAiApiCheckBaseUrlHistoryStorageService()
