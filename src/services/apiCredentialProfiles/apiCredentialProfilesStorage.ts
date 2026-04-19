import { Storage } from "@plasmohq/storage"

import {
  API_CREDENTIAL_PROFILES_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import {
  normalizeGoogleFamilyBaseUrl,
  normalizeOpenAiFamilyBaseUrl,
} from "~/services/verification/webAiApiCheck/extractCredentials"
import type {
  ApiCredentialProfile,
  ApiCredentialProfilesConfig,
  ApiCredentialTelemetryAttempt,
  ApiCredentialTelemetryCapabilityMode,
  ApiCredentialTelemetryConfig,
  ApiCredentialTelemetryCustomEndpoint,
  ApiCredentialTelemetryJsonPathMap,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import { API_CREDENTIAL_PROFILES_CONFIG_VERSION } from "~/types/apiCredentialProfiles"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to API credential profiles storage.
 */
const logger = createLogger("ApiCredentialProfilesStorage")

type ApiCredentialProfileCreateInput = {
  name: string
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  tagIds?: string[]
  notes?: string
  telemetryConfig?: Partial<ApiCredentialTelemetryConfig>
}

type ApiCredentialProfileUpdateInput = Partial<ApiCredentialProfileCreateInput>

const TELEMETRY_CAPABILITY_MODES: ApiCredentialTelemetryCapabilityMode[] = [
  "disabled",
  "auto",
  "openaiBilling",
  "newApiTokenUsage",
  "sub2apiUsage",
  "customReadOnlyEndpoint",
]

const DEFAULT_TELEMETRY_CONFIG: ApiCredentialTelemetryConfig = {
  mode: "auto",
}

const createDefaultConfig = (): ApiCredentialProfilesConfig => ({
  version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
  profiles: [],
  lastUpdated: Date.now(),
})

/**
 * Subscribe to local-storage writes affecting API credential profiles.
 */
export function subscribeToApiCredentialProfilesChanges(
  callback: () => void,
): () => void {
  const listener = (
    changes: Record<string, browser.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return
    if (
      !changes[API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES]
    ) {
      return
    }

    callback()
  }

  browser.storage.onChanged.addListener(listener)
  return () => browser.storage.onChanged.removeListener(listener)
}

/**
 * Clones the config.
 */
function cloneConfig(
  config: ApiCredentialProfilesConfig,
): ApiCredentialProfilesConfig {
  if (typeof structuredClone === "function") {
    return structuredClone(config)
  }
  return JSON.parse(JSON.stringify(config)) as ApiCredentialProfilesConfig
}

/**
 * Normalizes the tag ID list.
 */
function normalizeTagIdList(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const tagIds: string[] = []

  for (const value of raw) {
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    tagIds.push(trimmed)
  }

  return tagIds
}

/**
 * Coerces a numeric-like value into a finite number.
 */
function coerceFiniteNumber(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * Normalizes configured JSON paths for a custom telemetry endpoint.
 */
function coerceJsonPathMap(raw: unknown): ApiCredentialTelemetryJsonPathMap {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const out: ApiCredentialTelemetryJsonPathMap = {}
  const keys: Array<keyof ApiCredentialTelemetryJsonPathMap> = [
    "balanceUsd",
    "todayCostUsd",
    "todayRequests",
    "todayPromptTokens",
    "todayCompletionTokens",
    "todayTotalTokens",
    "totalUsedUsd",
    "totalGrantedUsd",
    "totalAvailableUsd",
    "expiresAt",
  ]

  for (const key of keys) {
    const value = obj[key]
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim()
    }
  }

  return out
}

/**
 * Coerces custom endpoint telemetry config into a usable persisted shape.
 */
function coerceCustomEndpoint(
  raw: unknown,
): ApiCredentialTelemetryCustomEndpoint | undefined {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const endpoint =
    typeof obj.endpoint === "string" && obj.endpoint.trim()
      ? obj.endpoint.trim()
      : ""
  const jsonPaths = coerceJsonPathMap(obj.jsonPaths)

  if (!endpoint || Object.keys(jsonPaths).length === 0) {
    return undefined
  }

  return { endpoint, jsonPaths }
}

/**
 * Coerces profile telemetry config and falls back to automatic probing.
 */
export function coerceApiCredentialTelemetryConfig(
  raw: unknown,
): ApiCredentialTelemetryConfig {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const rawMode = typeof obj.mode === "string" ? obj.mode : ""
  const mode = TELEMETRY_CAPABILITY_MODES.includes(
    rawMode as ApiCredentialTelemetryCapabilityMode,
  )
    ? (rawMode as ApiCredentialTelemetryCapabilityMode)
    : DEFAULT_TELEMETRY_CONFIG.mode
  const customEndpoint = coerceCustomEndpoint(obj.customEndpoint)

  return {
    mode,
    ...(customEndpoint ? { customEndpoint } : {}),
  }
}

/**
 * Normalizes persisted telemetry endpoint attempts.
 */
function coerceTelemetryAttempts(
  raw: unknown,
): ApiCredentialTelemetryAttempt[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item): ApiCredentialTelemetryAttempt | null => {
      if (!item || typeof item !== "object") return null
      const candidate = item as Record<string, unknown>
      const rawSource = candidate.source
      const source =
        typeof rawSource === "string" &&
        (rawSource === "models" ||
          TELEMETRY_CAPABILITY_MODES.includes(
            rawSource as ApiCredentialTelemetryCapabilityMode,
          ))
          ? (rawSource as ApiCredentialTelemetryAttempt["source"])
          : null
      const endpoint =
        typeof candidate.endpoint === "string" ? candidate.endpoint.trim() : ""
      const rawStatus = candidate.status
      const status =
        rawStatus === "success" ||
        rawStatus === "unsupported" ||
        rawStatus === "error"
          ? rawStatus
          : null

      if (!source || !endpoint || !status) return null

      const message =
        typeof candidate.message === "string" && candidate.message.trim()
          ? candidate.message.trim()
          : undefined

      return {
        source,
        endpoint,
        status,
        ...(message ? { message } : {}),
      }
    })
    .filter((item): item is ApiCredentialTelemetryAttempt => item !== null)
}

/**
 * Normalizes a persisted telemetry snapshot and drops unusable snapshots.
 */
function coerceTelemetrySnapshot(
  raw: unknown,
): ApiCredentialTelemetrySnapshot | undefined {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const lastSyncTime = coerceFiniteNumber(obj.lastSyncTime)
  if (!lastSyncTime || lastSyncTime <= 0) return undefined

  const rawHealth =
    obj.health && typeof obj.health === "object" ? obj.health : {}
  const healthRecord = rawHealth as Record<string, unknown>
  const health = {
    status:
      healthRecord.status === "healthy" ||
      healthRecord.status === "warning" ||
      healthRecord.status === "error" ||
      healthRecord.status === "unknown"
        ? healthRecord.status
        : "unknown",
    ...(typeof healthRecord.reason === "string" && healthRecord.reason.trim()
      ? { reason: healthRecord.reason.trim() }
      : {}),
  } as ApiCredentialTelemetrySnapshot["health"]

  const rawSource = obj.source
  const source =
    typeof rawSource === "string" &&
    (rawSource === "models" ||
      TELEMETRY_CAPABILITY_MODES.includes(
        rawSource as ApiCredentialTelemetryCapabilityMode,
      ))
      ? (rawSource as ApiCredentialTelemetrySnapshot["source"])
      : undefined

  const rawModels =
    obj.models && typeof obj.models === "object"
      ? (obj.models as Record<string, unknown>)
      : null
  const models =
    rawModels &&
    typeof rawModels.count === "number" &&
    Number.isFinite(rawModels.count)
      ? {
          count: Math.max(0, Math.trunc(rawModels.count)),
          preview: Array.isArray(rawModels.preview)
            ? rawModels.preview
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 20)
            : [],
        }
      : undefined

  const todayPromptTokens = coerceFiniteNumber(
    (obj.todayTokens as Record<string, unknown> | undefined)?.upload,
  )
  const todayCompletionTokens = coerceFiniteNumber(
    (obj.todayTokens as Record<string, unknown> | undefined)?.download,
  )

  return {
    health,
    lastSyncTime,
    ...(coerceFiniteNumber(obj.lastSuccessTime)
      ? { lastSuccessTime: coerceFiniteNumber(obj.lastSuccessTime) }
      : {}),
    ...(typeof obj.lastError === "string" && obj.lastError.trim()
      ? { lastError: obj.lastError.trim() }
      : {}),
    ...(source ? { source } : {}),
    ...(coerceFiniteNumber(obj.balanceUsd) !== undefined
      ? { balanceUsd: coerceFiniteNumber(obj.balanceUsd) }
      : {}),
    ...(coerceFiniteNumber(obj.todayCostUsd) !== undefined
      ? { todayCostUsd: coerceFiniteNumber(obj.todayCostUsd) }
      : {}),
    ...(coerceFiniteNumber(obj.todayRequests) !== undefined
      ? { todayRequests: coerceFiniteNumber(obj.todayRequests) }
      : {}),
    ...(todayPromptTokens !== undefined || todayCompletionTokens !== undefined
      ? {
          todayTokens: {
            upload: todayPromptTokens ?? 0,
            download: todayCompletionTokens ?? 0,
          },
        }
      : {}),
    ...(typeof obj.unlimitedQuota === "boolean"
      ? { unlimitedQuota: obj.unlimitedQuota }
      : {}),
    ...(coerceFiniteNumber(obj.totalUsedUsd) !== undefined
      ? { totalUsedUsd: coerceFiniteNumber(obj.totalUsedUsd) }
      : {}),
    ...(coerceFiniteNumber(obj.totalGrantedUsd) !== undefined
      ? { totalGrantedUsd: coerceFiniteNumber(obj.totalGrantedUsd) }
      : {}),
    ...(coerceFiniteNumber(obj.totalAvailableUsd) !== undefined
      ? { totalAvailableUsd: coerceFiniteNumber(obj.totalAvailableUsd) }
      : {}),
    ...(coerceFiniteNumber(obj.expiresAt) !== undefined
      ? { expiresAt: coerceFiniteNumber(obj.expiresAt) }
      : {}),
    ...(models ? { models } : {}),
    attempts: coerceTelemetryAttempts(obj.attempts),
  }
}

/**
 * Keeps the newest telemetry snapshot when duplicate profiles are merged.
 */
function mergeTelemetrySnapshot(
  first?: ApiCredentialTelemetrySnapshot,
  second?: ApiCredentialTelemetrySnapshot,
): ApiCredentialTelemetrySnapshot | undefined {
  if (!first) return second
  if (!second) return first

  const firstRank = Math.max(
    first.lastSuccessTime ?? 0,
    first.lastSyncTime ?? 0,
  )
  const secondRank = Math.max(
    second.lastSuccessTime ?? 0,
    second.lastSyncTime ?? 0,
  )
  return secondRank >= firstRank ? second : first
}

/**
 * Preserves explicit telemetry config when duplicate profiles are merged.
 */
function mergeTelemetryConfig(
  newer: ApiCredentialTelemetryConfig | undefined,
  older: ApiCredentialTelemetryConfig | undefined,
): ApiCredentialTelemetryConfig {
  const normalizedNewer = coerceApiCredentialTelemetryConfig(newer)
  const normalizedOlder = coerceApiCredentialTelemetryConfig(older)
  if (normalizedNewer.mode !== DEFAULT_TELEMETRY_CONFIG.mode) {
    return normalizedNewer
  }
  if (normalizedOlder.mode !== DEFAULT_TELEMETRY_CONFIG.mode) {
    return normalizedOlder
  }
  return normalizedNewer
}

/**
 * Normalizes the profile base URL.
 */
function normalizeProfileBaseUrl(
  apiType: ApiVerificationApiType,
  baseUrl: string,
): string | null {
  if (apiType === API_TYPES.GOOGLE) {
    return normalizeGoogleFamilyBaseUrl(baseUrl)
  }
  return normalizeOpenAiFamilyBaseUrl(baseUrl)
}

/**
 * Coerces the API type into a supported value.
 */
function coerceApiType(raw: unknown): ApiVerificationApiType {
  const value = typeof raw === "string" ? raw : ""
  return (Object.values(API_TYPES) as string[]).includes(value)
    ? (value as ApiVerificationApiType)
    : API_TYPES.OPENAI_COMPATIBLE
}

/**
 * Returns the profile identity key.
 */
function getIdentityKey(
  profile: Pick<ApiCredentialProfile, "apiType" | "baseUrl" | "apiKey">,
): string {
  // Note: apiKey is intentionally part of the identity. Do not log this value.
  return `${profile.apiType}::${profile.baseUrl}::${profile.apiKey}`
}

/**
 * Deduplicates profiles by identity.
 */
function dedupeProfiles(profiles: ApiCredentialProfile[]): {
  profiles: ApiCredentialProfile[]
  changed: boolean
} {
  const byIdentity = new Map<string, ApiCredentialProfile>()
  let changed = false

  for (const profile of profiles) {
    const key = getIdentityKey(profile)
    const existing = byIdentity.get(key)
    if (!existing) {
      byIdentity.set(key, profile)
      continue
    }

    changed = true
    const newer =
      (profile.updatedAt || 0) >= (existing.updatedAt || 0) ? profile : existing
    const older = newer === profile ? existing : profile

    const mergedTagIds = normalizeTagIdList([
      ...(Array.isArray(newer.tagIds) ? newer.tagIds : []),
      ...(Array.isArray(older.tagIds) ? older.tagIds : []),
    ])

    byIdentity.set(key, {
      ...newer,
      createdAt:
        Math.min(newer.createdAt || 0, older.createdAt || 0) || newer.createdAt,
      tagIds: mergedTagIds,
      telemetryConfig: mergeTelemetryConfig(
        newer.telemetryConfig,
        older.telemetryConfig,
      ),
      telemetrySnapshot: mergeTelemetrySnapshot(
        newer.telemetrySnapshot,
        older.telemetrySnapshot,
      ),
    })
  }

  return { profiles: Array.from(byIdentity.values()), changed }
}

/**
 * Coerces stored profile config into the supported shape.
 */
export function coerceApiCredentialProfilesConfig(
  raw: unknown,
  options?: { now?: number },
): ApiCredentialProfilesConfig {
  const now = typeof options?.now === "number" ? options.now : Date.now()
  const obj = raw && typeof raw === "object" ? (raw as any) : {}
  const version =
    typeof obj.version === "number"
      ? obj.version
      : API_CREDENTIAL_PROFILES_CONFIG_VERSION
  const lastUpdated = typeof obj.lastUpdated === "number" ? obj.lastUpdated : 0
  const rawProfiles = Array.isArray(obj.profiles) ? obj.profiles : []

  const profiles: ApiCredentialProfile[] = []
  for (const item of rawProfiles) {
    if (!item || typeof item !== "object") continue
    const candidate = item as any

    const id =
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id
        : safeRandomUUID("api-profile")

    const apiType = coerceApiType(candidate.apiType)

    const rawBaseUrl =
      typeof candidate.baseUrl === "string" ? candidate.baseUrl : ""
    const baseUrl =
      normalizeProfileBaseUrl(apiType, rawBaseUrl) ?? rawBaseUrl.trim()

    const apiKeyRaw =
      typeof candidate.apiKey === "string" ? candidate.apiKey : ""
    const apiKey = apiKeyRaw.trim()

    const rawName = typeof candidate.name === "string" ? candidate.name : ""
    const name = rawName.trim() || baseUrl || "API Profile"

    const createdAt =
      typeof candidate.createdAt === "number" ? candidate.createdAt : now
    const updatedAt =
      typeof candidate.updatedAt === "number" ? candidate.updatedAt : createdAt
    const notes = typeof candidate.notes === "string" ? candidate.notes : ""
    const tagIds = normalizeTagIdList(candidate.tagIds)

    if (!apiKey || !baseUrl) {
      // Skip obviously invalid rows; they are not actionable in UI.
      continue
    }

    profiles.push({
      id,
      name,
      apiType,
      baseUrl,
      apiKey,
      tagIds,
      notes: notes.trim(),
      telemetryConfig: coerceApiCredentialTelemetryConfig(
        candidate.telemetryConfig,
      ),
      telemetrySnapshot: coerceTelemetrySnapshot(candidate.telemetrySnapshot),
      createdAt,
      updatedAt,
    })
  }

  const { profiles: deduped } = dedupeProfiles(profiles)

  return {
    version,
    profiles: deduped,
    lastUpdated: lastUpdated || now,
  }
}

/**
 * Merges local and remote profile configs.
 */
export function mergeApiCredentialProfilesConfigs(params: {
  local: ApiCredentialProfilesConfig
  incoming: ApiCredentialProfilesConfig
  now?: number
}): ApiCredentialProfilesConfig {
  const now = typeof params.now === "number" ? params.now : Date.now()
  const local = coerceApiCredentialProfilesConfig(params.local, { now })
  const incoming = coerceApiCredentialProfilesConfig(params.incoming, { now })

  const { profiles } = dedupeProfiles([...local.profiles, ...incoming.profiles])

  return {
    version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
    profiles,
    lastUpdated: now,
  }
}

class ApiCredentialProfilesStorageService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({ area: "local" })
  }

  private async withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.API_CREDENTIAL_PROFILES,
      work,
    )
  }

  private async readConfig(): Promise<ApiCredentialProfilesConfig> {
    const raw = await this.storage.get(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
    )
    return coerceApiCredentialProfilesConfig(raw)
  }

  private async saveConfig(next: ApiCredentialProfilesConfig): Promise<void> {
    await this.storage.set(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      next,
    )
  }

  /**
   * Export the persisted profiles config for backup/sync.
   */
  async exportConfig(): Promise<ApiCredentialProfilesConfig> {
    return this.getConfig()
  }

  /**
   * Get the current profiles config with a safe default.
   */
  async getConfig(): Promise<ApiCredentialProfilesConfig> {
    try {
      return await this.readConfig()
    } catch (error) {
      logger.error("Failed to load API credential profiles config", error)
      return createDefaultConfig()
    }
  }

  /**
   * Replace the stored config with an imported payload (used by restore flows).
   *
   * The payload is coerced, normalized, and de-duped before persisting.
   */
  async importConfig(raw: unknown): Promise<ApiCredentialProfilesConfig> {
    return this.withStorageWriteLock(async () => {
      const now = Date.now()
      const coerced = coerceApiCredentialProfilesConfig(raw, { now })
      const next: ApiCredentialProfilesConfig = {
        version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
        profiles: coerced.profiles,
        lastUpdated: now,
      }
      await this.saveConfig(next)
      return next
    })
  }

  /**
   * Merge an imported payload into the existing config using identity de-dupe.
   */
  async mergeConfig(raw: unknown): Promise<ApiCredentialProfilesConfig> {
    return this.withStorageWriteLock(async () => {
      const now = Date.now()
      const local = coerceApiCredentialProfilesConfig(await this.readConfig(), {
        now,
      })
      const incoming = coerceApiCredentialProfilesConfig(raw, { now })

      const merged = mergeApiCredentialProfilesConfigs({
        local,
        incoming,
        now,
      })

      await this.saveConfig(merged)
      return merged
    })
  }

  /**
   * List profiles in a stable UI-friendly order (updatedAt desc, then name).
   */
  async listProfiles(): Promise<ApiCredentialProfile[]> {
    const config = await this.getConfig()
    return [...config.profiles].sort((a, b) => {
      if (a.updatedAt !== b.updatedAt)
        return (b.updatedAt || 0) - (a.updatedAt || 0)
      return (a.name || "").localeCompare(b.name || "")
    })
  }

  async getProfileById(id: string): Promise<ApiCredentialProfile | null> {
    const config = await this.getConfig()
    return config.profiles.find((p) => p.id === id) ?? null
  }

  /**
   * Create a new profile. If an identical profile already exists (same apiType,
   * normalized baseUrl, and apiKey), it is returned instead.
   */
  async createProfile(
    input: ApiCredentialProfileCreateInput,
  ): Promise<ApiCredentialProfile> {
    const normalizedName = (input.name ?? "").trim()
    const normalizedKey = (input.apiKey ?? "").trim()
    if (!normalizedName) {
      throw new Error("Profile name cannot be empty.")
    }
    if (!normalizedKey) {
      throw new Error("API key cannot be empty.")
    }

    const normalizedBaseUrl = normalizeProfileBaseUrl(
      input.apiType,
      input.baseUrl,
    )
    if (!normalizedBaseUrl) {
      throw new Error("Base URL is invalid.")
    }

    const now = Date.now()
    const nextProfile: ApiCredentialProfile = {
      id: safeRandomUUID("api-profile"),
      name: normalizedName,
      apiType: input.apiType,
      baseUrl: normalizedBaseUrl,
      apiKey: normalizedKey,
      tagIds: normalizeTagIdList(input.tagIds),
      notes: typeof input.notes === "string" ? input.notes.trim() : "",
      telemetryConfig: coerceApiCredentialTelemetryConfig(
        input.telemetryConfig,
      ),
      createdAt: now,
      updatedAt: now,
    }

    return this.withStorageWriteLock(async () => {
      const config = cloneConfig(await this.readConfig())

      const identityKey = getIdentityKey(nextProfile)
      const existing = config.profiles.find(
        (p) => getIdentityKey(p) === identityKey,
      )
      if (existing) {
        return existing
      }

      const { profiles: dedupedProfiles } = dedupeProfiles([
        ...(Array.isArray(config.profiles) ? config.profiles : []),
        nextProfile,
      ])

      const nextConfig: ApiCredentialProfilesConfig = {
        version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
        profiles: dedupedProfiles,
        lastUpdated: now,
      }

      await this.saveConfig(nextConfig)
      return nextProfile
    })
  }

  /**
   * Update an existing profile by id.
   *
   * If the updated profile conflicts by identity (apiType + baseUrl + apiKey),
   * profiles are de-duped by keeping the one with the newest updatedAt and
   * unioning tag ids.
   */
  async updateProfile(
    id: string,
    updates: ApiCredentialProfileUpdateInput,
  ): Promise<ApiCredentialProfile> {
    return this.withStorageWriteLock(async () => {
      const config = cloneConfig(await this.readConfig())
      const profiles = Array.isArray(config.profiles) ? config.profiles : []
      const index = profiles.findIndex((p) => p.id === id)
      if (index === -1) {
        throw new Error("Profile not found.")
      }

      const current = profiles[index]
      const nextName =
        typeof updates.name === "string" ? updates.name.trim() : current.name
      if (!nextName) {
        throw new Error("Profile name cannot be empty.")
      }

      const nextApiKey =
        typeof updates.apiKey === "string"
          ? updates.apiKey.trim()
          : current.apiKey
      if (!nextApiKey) {
        throw new Error("API key cannot be empty.")
      }

      const nextApiType =
        typeof updates.apiType === "string" ? updates.apiType : current.apiType

      const rawBaseUrl =
        typeof updates.baseUrl === "string" ? updates.baseUrl : current.baseUrl
      const nextBaseUrl = normalizeProfileBaseUrl(nextApiType, rawBaseUrl)
      if (!nextBaseUrl) {
        throw new Error("Base URL is invalid.")
      }

      const next: ApiCredentialProfile = {
        ...current,
        name: nextName,
        apiType: nextApiType,
        baseUrl: nextBaseUrl,
        apiKey: nextApiKey,
        tagIds:
          updates.tagIds !== undefined
            ? normalizeTagIdList(updates.tagIds)
            : current.tagIds,
        notes:
          typeof updates.notes === "string"
            ? updates.notes.trim()
            : current.notes,
        telemetryConfig:
          updates.telemetryConfig !== undefined
            ? coerceApiCredentialTelemetryConfig(updates.telemetryConfig)
            : current.telemetryConfig,
        telemetrySnapshot:
          nextApiType !== current.apiType ||
          nextBaseUrl !== current.baseUrl ||
          nextApiKey !== current.apiKey
            ? undefined
            : current.telemetrySnapshot,
        updatedAt: Date.now(),
      }

      const merged = profiles.map((p) => (p.id === id ? next : p))
      const { profiles: dedupedProfiles } = dedupeProfiles(merged)

      const nextConfig: ApiCredentialProfilesConfig = {
        version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
        profiles: dedupedProfiles,
        lastUpdated: Date.now(),
      }

      await this.saveConfig(nextConfig)

      const saved = dedupedProfiles.find((p) => p.id === id)
      if (saved) {
        return saved
      }

      // If dedupe merged this profile into another identity twin, return the
      // newest profile for that identity.
      const identityKey = getIdentityKey(next)
      const winner = dedupedProfiles.find(
        (p) => getIdentityKey(p) === identityKey,
      )
      if (winner) {
        return winner
      }

      return next
    })
  }

  /**
   * Persist the latest read-only telemetry query snapshot for a profile.
   */
  async updateTelemetrySnapshot(
    id: string,
    snapshot: ApiCredentialTelemetrySnapshot,
  ): Promise<ApiCredentialProfile> {
    return this.withStorageWriteLock(async () => {
      const config = cloneConfig(await this.readConfig())
      const profiles = Array.isArray(config.profiles) ? config.profiles : []
      const index = profiles.findIndex((profile) => profile.id === id)
      if (index === -1) {
        throw new Error("Profile not found.")
      }

      const nextProfile: ApiCredentialProfile = {
        ...profiles[index],
        telemetrySnapshot: coerceTelemetrySnapshot(snapshot) ?? snapshot,
      }

      const nextProfiles = profiles.map((profile) =>
        profile.id === id ? nextProfile : profile,
      )

      await this.saveConfig({
        version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
        profiles: nextProfiles,
        lastUpdated: Date.now(),
      })

      return nextProfile
    })
  }

  /**
   * Remove a tag id from all profiles.
   *
   * This is primarily used by global tag deletion logic to maintain referential
   * integrity across taggable entities.
   */
  async removeTagIdFromAllProfiles(
    tagId: string,
  ): Promise<{ updatedProfiles: number }> {
    const normalizedTagId = String(tagId ?? "").trim()
    if (!normalizedTagId) {
      return { updatedProfiles: 0 }
    }

    return this.withStorageWriteLock(async () => {
      const now = Date.now()
      const config = cloneConfig(await this.readConfig())
      const profiles = Array.isArray(config.profiles) ? config.profiles : []

      let updatedProfiles = 0
      const nextProfiles = profiles.map((profile) => {
        if (!Array.isArray(profile.tagIds) || profile.tagIds.length === 0) {
          return profile
        }
        if (!profile.tagIds.includes(normalizedTagId)) {
          return profile
        }

        updatedProfiles++
        return {
          ...profile,
          tagIds: profile.tagIds.filter((id) => id !== normalizedTagId),
          updatedAt: now,
        }
      })

      if (updatedProfiles === 0) {
        return { updatedProfiles: 0 }
      }

      const { profiles: dedupedProfiles } = dedupeProfiles(nextProfiles)

      await this.saveConfig({
        version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
        profiles: dedupedProfiles,
        lastUpdated: now,
      })

      return { updatedProfiles }
    })
  }

  /**
   * Delete a profile by id.
   */
  async deleteProfile(id: string): Promise<boolean> {
    return this.withStorageWriteLock(async () => {
      const config = cloneConfig(await this.readConfig())
      const profiles = Array.isArray(config.profiles) ? config.profiles : []
      const filtered = profiles.filter((p) => p.id !== id)
      if (filtered.length === profiles.length) {
        return false
      }

      await this.saveConfig({
        version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
        profiles: filtered,
        lastUpdated: Date.now(),
      })
      return true
    })
  }

  /**
   * Clear all stored profiles (test helper).
   */
  async clearAllData(): Promise<void> {
    await this.storage.remove(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
    )
  }
}

export const apiCredentialProfilesStorage =
  new ApiCredentialProfilesStorageService()
