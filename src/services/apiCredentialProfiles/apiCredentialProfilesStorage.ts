import { Storage } from "@plasmohq/storage"

import {
  getAccountRuntimeKeyLocatorIdentity,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import {
  API_CREDENTIAL_PROFILE_CAPTURE_STATUSES,
  API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES,
  type ApiCredentialProfileCaptureStatus,
} from "~/services/apiCredentialProfiles/apiCredentialProfileLinkContracts"
import {
  addProfileLinkTombstones,
  coerceAccountRuntimeKeyLocator,
  coerceProfileLinks,
  coerceProfileLinkTombstones,
  normalizeProfileLinks,
} from "~/services/apiCredentialProfiles/apiCredentialProfileLinkStorage"
import { coerceApiCredentialTelemetryCustomEndpoint } from "~/services/apiCredentialProfiles/telemetryConfig"
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
  API_CREDENTIAL_PROFILE_LINK_SOURCES,
  ApiCredentialProfile,
  ApiCredentialProfileLink,
  ApiCredentialProfileLinkSource,
  ApiCredentialProfileLinkTombstone,
  ApiCredentialProfilesConfig,
  ApiCredentialTelemetryAttempt,
  ApiCredentialTelemetryCapabilityMode,
  ApiCredentialTelemetryConfig,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_PROFILE_LINK_STATES,
  API_CREDENTIAL_PROFILES_CONFIG_VERSION,
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_CAPABILITY_MODES,
  API_CREDENTIAL_TELEMETRY_SOURCES,
  DEFAULT_API_CREDENTIAL_TELEMETRY_CONFIG,
} from "~/types/apiCredentialProfiles"
import { onStorageChanged } from "~/utils/browser/browserApi"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to API credential profiles storage.
 */
const logger = createLogger("ApiCredentialProfilesStorage")

export type ApiCredentialProfileCreateInput = {
  name: string
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  tagIds?: string[]
  notes?: string
  expiresAt?: number | null
  telemetryConfig?: Partial<ApiCredentialTelemetryConfig>
}

type ApiCredentialProfileUpdateInput = Partial<ApiCredentialProfileCreateInput>

export type ApiCredentialProfileCaptureInput = {
  profile: ApiCredentialProfileCreateInput
  locator?: AccountRuntimeKeyLocator
  linkedBy: Extract<
    ApiCredentialProfileLinkSource,
    | typeof API_CREDENTIAL_PROFILE_LINK_SOURCES.CreationResponse
    | typeof API_CREDENTIAL_PROFILE_LINK_SOURCES.ResolvedRuntimeKey
  >
}

export type ApiCredentialProfileCaptureResult = {
  status: ApiCredentialProfileCaptureStatus
  profile: ApiCredentialProfile
}

export type ApiCredentialProfileLinkResolution =
  | {
      status: typeof API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Resolved
      link: ApiCredentialProfileLink
      profile: ApiCredentialProfile
    }
  | {
      status:
        | typeof API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.NotFound
        | typeof API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Stale
    }
  | {
      status:
        | typeof API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.NeedsConfirmation
        | typeof API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Ambiguous
      links: ApiCredentialProfileLink[]
    }

export type ApiCredentialProfileLinkInput = {
  profileId: string
  locator: AccountRuntimeKeyLocator
  linkedBy: ApiCredentialProfileLinkSource
}

export type ApiCredentialProfileRelinkInput = ApiCredentialProfileLinkInput & {
  id: string
}

const createDefaultConfig = (): ApiCredentialProfilesConfig => ({
  version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
  profiles: [],
  links: [],
  linkTombstones: [],
  lastUpdated: Date.now(),
})

/** Rejects nested profile snapshots created by a newer schema before coercion. */
export function assertSupportedApiCredentialProfilesConfigVersion(
  raw: unknown,
): void {
  if (!raw || typeof raw !== "object") return

  const version = (raw as Record<string, unknown>).version
  if (
    typeof version === "number" &&
    version > API_CREDENTIAL_PROFILES_CONFIG_VERSION
  ) {
    throw new Error(
      `Unsupported API credential profiles config version: ${version}`,
    )
  }
}

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

  return onStorageChanged(listener)
}

/** Clones persisted JSON-compatible values across supported extension runtimes. */
function clonePersistedValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

const cloneConfig = (config: ApiCredentialProfilesConfig) =>
  clonePersistedValue(config)

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
 * Coerces an optional user-maintained expiration timestamp.
 */
function coerceOptionalTimestamp(raw: unknown): number | undefined {
  const value = coerceFiniteNumber(raw)
  if (value === undefined || value <= 0) return undefined
  return Math.round(value)
}

/**
 * Coerces profile telemetry config and falls back to automatic probing.
 */
export function coerceApiCredentialTelemetryConfig(
  raw: unknown,
  options?: { baseUrl?: string },
): ApiCredentialTelemetryConfig {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const rawMode = typeof obj.mode === "string" ? obj.mode : ""
  const mode = API_CREDENTIAL_TELEMETRY_CAPABILITY_MODES.includes(
    rawMode as ApiCredentialTelemetryCapabilityMode,
  )
    ? (rawMode as ApiCredentialTelemetryCapabilityMode)
    : DEFAULT_API_CREDENTIAL_TELEMETRY_CONFIG.mode
  const customEndpoint = coerceApiCredentialTelemetryCustomEndpoint(
    obj.customEndpoint,
    options?.baseUrl,
  )

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
        (rawSource === API_CREDENTIAL_TELEMETRY_SOURCES.Models ||
          API_CREDENTIAL_TELEMETRY_CAPABILITY_MODES.includes(
            rawSource as ApiCredentialTelemetryCapabilityMode,
          ))
          ? (rawSource as ApiCredentialTelemetryAttempt["source"])
          : null
      const endpoint =
        typeof candidate.endpoint === "string" ? candidate.endpoint.trim() : ""
      const rawStatus = candidate.status
      const status =
        rawStatus === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Success ||
        rawStatus === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Unsupported ||
        rawStatus === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error
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
    (rawSource === API_CREDENTIAL_TELEMETRY_SOURCES.Models ||
      API_CREDENTIAL_TELEMETRY_CAPABILITY_MODES.includes(
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
  newer: ApiCredentialTelemetryConfig,
  older: ApiCredentialTelemetryConfig,
): ApiCredentialTelemetryConfig {
  if (newer.mode !== DEFAULT_API_CREDENTIAL_TELEMETRY_CONFIG.mode) {
    return newer
  }
  if (older.mode !== DEFAULT_API_CREDENTIAL_TELEMETRY_CONFIG.mode) {
    return older
  }
  return newer
}

/**
 * Compares telemetry configs after boundary coercion has made key order stable.
 */
function isSameTelemetryConfig(
  first: ApiCredentialTelemetryConfig,
  second: ApiCredentialTelemetryConfig,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
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
  profileIdRemap: Map<string, string>
  changed: boolean
} {
  const byIdentity = new Map<string, ApiCredentialProfile>()
  const profileIdRemap = new Map<string, string>()
  let changed = false

  for (const profile of profiles) {
    const key = getIdentityKey(profile)
    const existing = byIdentity.get(key)
    if (!existing) {
      byIdentity.set(key, profile)
      profileIdRemap.set(profile.id, profile.id)
      continue
    }

    changed = true
    const newer =
      (profile.updatedAt || 0) >= (existing.updatedAt || 0) ? profile : existing
    const older = newer === profile ? existing : profile
    profileIdRemap.set(older.id, newer.id)
    profileIdRemap.set(newer.id, newer.id)

    const mergedTagIds = normalizeTagIdList([
      ...(Array.isArray(newer.tagIds) ? newer.tagIds : []),
      ...(Array.isArray(older.tagIds) ? older.tagIds : []),
    ])
    const newerTelemetryConfig = coerceApiCredentialTelemetryConfig(
      newer.telemetryConfig,
      { baseUrl: newer.baseUrl },
    )
    const olderTelemetryConfig = coerceApiCredentialTelemetryConfig(
      older.telemetryConfig,
      { baseUrl: older.baseUrl },
    )
    const telemetryConfig = mergeTelemetryConfig(
      newerTelemetryConfig,
      olderTelemetryConfig,
    )
    const telemetrySnapshot = mergeTelemetrySnapshot(
      isSameTelemetryConfig(newerTelemetryConfig, telemetryConfig)
        ? newer.telemetrySnapshot
        : undefined,
      isSameTelemetryConfig(olderTelemetryConfig, telemetryConfig)
        ? older.telemetrySnapshot
        : undefined,
    )

    byIdentity.set(key, {
      ...newer,
      createdAt:
        Math.min(newer.createdAt || 0, older.createdAt || 0) || newer.createdAt,
      tagIds: mergedTagIds,
      telemetryConfig,
      telemetrySnapshot,
    })
  }

  const resolveProfileId = (profileId: string): string => {
    const visited = new Set<string>()
    let current = profileId
    while (!visited.has(current)) {
      visited.add(current)
      const next = profileIdRemap.get(current)
      if (!next || next === current) return current
      current = next
    }
    return current
  }

  for (const profileId of profileIdRemap.keys()) {
    profileIdRemap.set(profileId, resolveProfileId(profileId))
  }

  return {
    profiles: Array.from(byIdentity.values()),
    profileIdRemap,
    changed,
  }
}

/**
 * Coerces stored profile config into the supported shape.
 */
export function coerceApiCredentialProfilesConfig(
  raw: unknown,
  options?: { now?: number },
): ApiCredentialProfilesConfig {
  const now = typeof options?.now === "number" ? options.now : Date.now()
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const lastUpdated = typeof obj.lastUpdated === "number" ? obj.lastUpdated : 0
  const rawProfiles = Array.isArray(obj.profiles) ? obj.profiles : []

  const profiles: ApiCredentialProfile[] = []
  for (const item of rawProfiles) {
    if (!item || typeof item !== "object") continue
    const candidate = item as Record<string, unknown>

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
    const expiresAt = coerceOptionalTimestamp(candidate.expiresAt)

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
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      telemetryConfig: coerceApiCredentialTelemetryConfig(
        candidate.telemetryConfig,
        { baseUrl },
      ),
      telemetrySnapshot: coerceTelemetrySnapshot(candidate.telemetrySnapshot),
      createdAt,
      updatedAt,
    })
  }

  const { profiles: deduped, profileIdRemap } = dedupeProfiles(profiles)
  const linkTombstones = coerceProfileLinkTombstones(obj.linkTombstones)
  const links = normalizeProfileLinks(
    coerceProfileLinks({
      raw: obj.links,
      profileIdRemap,
      now,
    }),
    new Set(deduped.map(({ id }) => id)),
    linkTombstones,
  )

  return {
    version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
    profiles: deduped,
    links,
    linkTombstones,
    lastUpdated: lastUpdated || now,
  }
}

/**
 * Merges local and remote profile configs.
 */
export function mergeApiCredentialProfilesConfigs(params: {
  local: unknown
  incoming: unknown
  now?: number
}): ApiCredentialProfilesConfig {
  const now = typeof params.now === "number" ? params.now : Date.now()
  assertSupportedApiCredentialProfilesConfigVersion(params.incoming)
  const local = coerceApiCredentialProfilesConfig(params.local, { now })
  const incoming = coerceApiCredentialProfilesConfig(params.incoming, { now })

  const { profiles, profileIdRemap } = dedupeProfiles([
    ...local.profiles,
    ...incoming.profiles,
  ])
  const remappedLinks = [...local.links, ...incoming.links].map((link) => ({
    ...link,
    profileId: profileIdRemap.get(link.profileId) ?? link.profileId,
  }))
  const linkTombstones = coerceProfileLinkTombstones([
    ...local.linkTombstones,
    ...incoming.linkTombstones,
  ])
  const links = normalizeProfileLinks(
    remappedLinks,
    new Set(profiles.map(({ id }) => id)),
    linkTombstones,
  )

  return {
    version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
    profiles,
    links,
    linkTombstones,
    lastUpdated: now,
  }
}

const createNormalizedProfile = (
  input: ApiCredentialProfileCreateInput,
  now: number,
): ApiCredentialProfile => {
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

  const expiresAt = coerceOptionalTimestamp(input.expiresAt)
  return {
    id: safeRandomUUID("api-profile"),
    name: normalizedName,
    apiType: input.apiType,
    baseUrl: normalizedBaseUrl,
    apiKey: normalizedKey,
    tagIds: normalizeTagIdList(input.tagIds),
    notes: typeof input.notes === "string" ? input.notes.trim() : "",
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    telemetryConfig: coerceApiCredentialTelemetryConfig(input.telemetryConfig, {
      baseUrl: normalizedBaseUrl,
    }),
    createdAt: now,
    updatedAt: now,
  }
}

const createNextConfig = (params: {
  current: ApiCredentialProfilesConfig
  profiles?: ApiCredentialProfile[]
  links?: ApiCredentialProfileLink[]
  linkTombstones?: ApiCredentialProfileLinkTombstone[]
  now: number
}): ApiCredentialProfilesConfig => {
  const profiles = params.profiles ?? params.current.profiles
  const linkTombstones = params.linkTombstones ?? params.current.linkTombstones
  const links = normalizeProfileLinks(
    params.links ?? params.current.links,
    new Set(profiles.map(({ id }) => id)),
    linkTombstones,
  )
  return {
    version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
    profiles,
    links,
    linkTombstones,
    lastUpdated: params.now,
  }
}

const findProfileLinkForPair = (
  links: readonly ApiCredentialProfileLink[],
  profileId: string,
  locator: AccountRuntimeKeyLocator,
): ApiCredentialProfileLink | undefined => {
  const locatorIdentity = getAccountRuntimeKeyLocatorIdentity(locator)
  return links.find(
    (link) =>
      link.profileId === profileId &&
      getAccountRuntimeKeyLocatorIdentity(link.locator) === locatorIdentity,
  )
}

const createProfileLink = (params: {
  links: readonly ApiCredentialProfileLink[]
  profileId: string
  locator: AccountRuntimeKeyLocator
  linkedBy: ApiCredentialProfileLinkSource
  now: number
}): {
  link: ApiCredentialProfileLink
  hasLocatorConflict: boolean
} => {
  const locatorIdentity = getAccountRuntimeKeyLocatorIdentity(params.locator)
  const hasLocatorConflict = params.links.some(
    (link) =>
      getAccountRuntimeKeyLocatorIdentity(link.locator) === locatorIdentity,
  )

  return {
    link: {
      id: safeRandomUUID("api-profile-link"),
      profileId: params.profileId,
      locator: params.locator,
      state: hasLocatorConflict
        ? API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation
        : API_CREDENTIAL_PROFILE_LINK_STATES.Active,
      linkedBy: params.linkedBy,
      createdAt: params.now,
      updatedAt: params.now,
    },
    hasLocatorConflict,
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
        links: coerced.links,
        linkTombstones: coerced.linkTombstones,
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
      const merged = mergeApiCredentialProfilesConfigs({
        local: await this.readConfig(),
        incoming: raw,
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

  async captureProfile(
    input: ApiCredentialProfileCaptureInput,
  ): Promise<ApiCredentialProfileCaptureResult> {
    const now = Date.now()
    const candidateProfile = createNormalizedProfile(input.profile, now)
    const locator = input.locator
      ? coerceAccountRuntimeKeyLocator(input.locator)
      : null
    if (input.locator && !locator) {
      throw new Error("Account runtime key locator is invalid.")
    }

    return this.withStorageWriteLock(async () => {
      const config = cloneConfig(await this.readConfig())
      const identityKey = getIdentityKey(candidateProfile)
      const profile =
        config.profiles.find(
          (existing) => getIdentityKey(existing) === identityKey,
        ) ?? candidateProfile

      const profiles = config.profiles.some(({ id }) => id === profile.id)
        ? config.profiles
        : [...config.profiles, profile]
      if (!locator) {
        await this.saveConfig(
          createNextConfig({ current: config, profiles, now }),
        )
        return {
          status: API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.CapturedUnlinked,
          profile,
        }
      }

      const samePair = findProfileLinkForPair(config.links, profile.id, locator)
      if (samePair) {
        return {
          status:
            samePair.state ===
            API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation
              ? API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.AssociationConflict
              : API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.Captured,
          profile,
        }
      }

      const { link, hasLocatorConflict } = createProfileLink({
        links: config.links,
        profileId: profile.id,
        locator,
        linkedBy: input.linkedBy,
        now,
      })
      await this.saveConfig(
        createNextConfig({
          current: config,
          profiles,
          links: [...config.links, link],
          now,
        }),
      )
      return {
        status: hasLocatorConflict
          ? API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.AssociationConflict
          : API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.Captured,
        profile,
      }
    })
  }

  async listLinks(): Promise<ApiCredentialProfileLink[]> {
    const config = await this.getConfig()
    return config.links.map((link) => clonePersistedValue(link))
  }

  async getLinkById(id: string): Promise<ApiCredentialProfileLink | null> {
    const links = await this.listLinks()
    return links.find((link) => link.id === id) ?? null
  }

  async listLinksForProfile(
    profileId: string,
  ): Promise<ApiCredentialProfileLink[]> {
    const links = await this.listLinks()
    return links.filter((link) => link.profileId === profileId)
  }

  async findLinksForLocator(
    locator: AccountRuntimeKeyLocator,
  ): Promise<ApiCredentialProfileLink[]> {
    const locatorIdentity = getAccountRuntimeKeyLocatorIdentity(locator)
    const links = await this.listLinks()
    return links.filter(
      (link) =>
        getAccountRuntimeKeyLocatorIdentity(link.locator) === locatorIdentity,
    )
  }

  async resolveLink(
    locator: AccountRuntimeKeyLocator,
  ): Promise<ApiCredentialProfileLinkResolution> {
    const links = await this.findLinksForLocator(locator)
    if (links.length === 0) {
      return {
        status: API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.NotFound,
      }
    }
    if (links.length > 1) {
      return {
        status: API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Ambiguous,
        links,
      }
    }

    const [link] = links
    if (link.state !== API_CREDENTIAL_PROFILE_LINK_STATES.Active) {
      return {
        status:
          API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.NeedsConfirmation,
        links,
      }
    }
    const profile = await this.getProfileById(link.profileId)
    return profile
      ? {
          status: API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Resolved,
          link,
          profile,
        }
      : { status: API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Stale }
  }

  async linkProfile(
    input: ApiCredentialProfileLinkInput,
  ): Promise<ApiCredentialProfileLink> {
    return this.withStorageWriteLock(async () => {
      const now = Date.now()
      const config = cloneConfig(await this.readConfig())
      if (!config.profiles.some(({ id }) => id === input.profileId)) {
        throw new Error("Profile not found.")
      }
      const locator = coerceAccountRuntimeKeyLocator(input.locator)
      if (!locator) throw new Error("Account runtime key locator is invalid.")

      const existing = findProfileLinkForPair(
        config.links,
        input.profileId,
        locator,
      )
      if (existing) return existing

      const { link } = createProfileLink({
        links: config.links,
        profileId: input.profileId,
        locator,
        linkedBy: input.linkedBy,
        now,
      })
      const next = createNextConfig({
        current: config,
        links: [...config.links, link],
        now,
      })
      await this.saveConfig(next)
      return next.links.find(({ id }) => id === link.id) ?? link
    })
  }

  async relinkProfile(
    input: ApiCredentialProfileRelinkInput,
  ): Promise<ApiCredentialProfileLink> {
    return this.withStorageWriteLock(async () => {
      const now = Date.now()
      const config = cloneConfig(await this.readConfig())
      const current = config.links.find(({ id }) => id === input.id)
      if (!current) throw new Error("Credential profile link not found.")
      if (!config.profiles.some(({ id }) => id === input.profileId)) {
        throw new Error("Profile not found.")
      }
      const locator = coerceAccountRuntimeKeyLocator(input.locator)
      if (!locator) throw new Error("Account runtime key locator is invalid.")
      const locatorIdentity = getAccountRuntimeKeyLocatorIdentity(locator)
      const removedLinks = config.links.filter(
        (link) =>
          link.id !== input.id &&
          getAccountRuntimeKeyLocatorIdentity(link.locator) === locatorIdentity,
      )
      const links = config.links
        .filter(
          (link) =>
            link.id === input.id ||
            getAccountRuntimeKeyLocatorIdentity(link.locator) !==
              locatorIdentity,
        )
        .map((link) =>
          link.id === input.id
            ? {
                ...link,
                profileId: input.profileId,
                locator,
                state: API_CREDENTIAL_PROFILE_LINK_STATES.Active,
                linkedBy: input.linkedBy,
                updatedAt: now,
              }
            : link,
        )
      const next = createNextConfig({
        current: config,
        links,
        linkTombstones: addProfileLinkTombstones(
          config.linkTombstones,
          removedLinks,
          now,
        ),
        now,
      })
      await this.saveConfig(next)
      const relinked = next.links.find(({ id }) => id === input.id)
      if (!relinked) throw new Error("Credential profile relink failed.")
      return relinked
    })
  }

  async unlinkProfile(id: string): Promise<boolean> {
    return this.withStorageWriteLock(async () => {
      const config = cloneConfig(await this.readConfig())
      const removedLinks = config.links.filter((link) => link.id === id)
      const links = config.links.filter((link) => link.id !== id)
      if (links.length === config.links.length) return false
      const now = Date.now()
      await this.saveConfig(
        createNextConfig({
          current: config,
          links,
          linkTombstones: addProfileLinkTombstones(
            config.linkTombstones,
            removedLinks,
            now,
          ),
          now,
        }),
      )
      return true
    })
  }

  /**
   * Create a new profile. If an identical profile already exists (same apiType,
   * normalized baseUrl, and apiKey), it is returned instead.
   */
  async createProfile(
    input: ApiCredentialProfileCreateInput,
  ): Promise<ApiCredentialProfile> {
    const now = Date.now()
    const nextProfile = createNormalizedProfile(input, now)

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

      const nextConfig = createNextConfig({
        current: config,
        profiles: dedupedProfiles,
        now,
      })

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

      const shouldReCoerceTelemetryConfig =
        updates.telemetryConfig !== undefined ||
        nextApiType !== current.apiType ||
        nextBaseUrl !== current.baseUrl
      const currentTelemetryConfig = coerceApiCredentialTelemetryConfig(
        current.telemetryConfig,
        { baseUrl: current.baseUrl },
      )
      const nextTelemetryConfig = shouldReCoerceTelemetryConfig
        ? coerceApiCredentialTelemetryConfig(
            updates.telemetryConfig !== undefined
              ? updates.telemetryConfig
              : current.telemetryConfig,
            { baseUrl: nextBaseUrl },
          )
        : currentTelemetryConfig
      const hasTelemetryConfigChanged = !isSameTelemetryConfig(
        nextTelemetryConfig,
        currentTelemetryConfig,
      )
      const nextExpiresAt =
        updates.expiresAt !== undefined
          ? coerceOptionalTimestamp(updates.expiresAt)
          : current.expiresAt
      const { expiresAt: _currentExpiresAt, ...currentWithoutExpiresAt } =
        current

      const next: ApiCredentialProfile = {
        ...currentWithoutExpiresAt,
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
        ...(nextExpiresAt !== undefined ? { expiresAt: nextExpiresAt } : {}),
        telemetryConfig: nextTelemetryConfig,
        telemetrySnapshot:
          nextApiType !== current.apiType ||
          nextBaseUrl !== current.baseUrl ||
          nextApiKey !== current.apiKey ||
          hasTelemetryConfigChanged
            ? undefined
            : current.telemetrySnapshot,
        updatedAt: Date.now(),
      }

      const merged = profiles.map((p) => (p.id === id ? next : p))
      const { profiles: dedupedProfiles, profileIdRemap } =
        dedupeProfiles(merged)
      const hasCredentialIdentityChanged =
        nextApiType !== current.apiType ||
        nextBaseUrl !== current.baseUrl ||
        nextApiKey !== current.apiKey
      const links = config.links.map((link) => ({
        ...link,
        profileId: profileIdRemap.get(link.profileId) ?? link.profileId,
        state:
          hasCredentialIdentityChanged && link.profileId === id
            ? API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation
            : link.state,
      }))
      const nextConfig = createNextConfig({
        current: config,
        profiles: dedupedProfiles,
        links,
        now: Date.now(),
      })

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

      const telemetrySnapshot = coerceTelemetrySnapshot(snapshot)
      if (!telemetrySnapshot) {
        throw new Error("Invalid telemetry snapshot.")
      }

      const nextProfile: ApiCredentialProfile = {
        ...profiles[index],
        telemetrySnapshot,
      }

      const nextProfiles = profiles.map((profile) =>
        profile.id === id ? nextProfile : profile,
      )

      await this.saveConfig(
        createNextConfig({
          current: config,
          profiles: nextProfiles,
          now: Date.now(),
        }),
      )

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

      const { profiles: dedupedProfiles, profileIdRemap } =
        dedupeProfiles(nextProfiles)
      const links = config.links.map((link) => ({
        ...link,
        profileId: profileIdRemap.get(link.profileId) ?? link.profileId,
      }))

      await this.saveConfig(
        createNextConfig({
          current: config,
          profiles: dedupedProfiles,
          links,
          now,
        }),
      )

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
      const now = Date.now()

      await this.saveConfig(
        createNextConfig({
          current: config,
          profiles: filtered,
          links: config.links.filter((link) => link.profileId !== id),
          linkTombstones: addProfileLinkTombstones(
            config.linkTombstones,
            config.links.filter((link) => link.profileId === id),
            now,
          ),
          now,
        }),
      )
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
