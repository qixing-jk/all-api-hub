import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import {
  coerceProfileLinks,
  coerceProfileLinkTombstones,
  normalizeProfileLinks,
} from "~/services/apiCredentialProfiles/apiCredentialProfileLinkStorage"
import type { ApiCredentialProfileCreateInput } from "~/services/apiCredentialProfiles/profileStorageContracts"
import { coerceApiCredentialTelemetryCustomEndpoint } from "~/services/apiCredentialProfiles/telemetryConfig"
import { coerceTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetrySnapshotCodec"
import { normalizeHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification/types"
import type {
  ApiCredentialProfile,
  ApiCredentialProfileLink,
  ApiCredentialProfileLinkTombstone,
  ApiCredentialProfilesConfig,
  ApiCredentialTelemetryCapabilityMode,
  ApiCredentialTelemetryConfig,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_PROFILES_CONFIG_VERSION,
  API_CREDENTIAL_TELEMETRY_CAPABILITY_MODES,
  DEFAULT_API_CREDENTIAL_TELEMETRY_CONFIG,
} from "~/types/apiCredentialProfiles"
import { safeRandomUUID } from "~/utils/core/identifier"
import { isHttpUrl } from "~/utils/core/urlParsing"
import { t } from "~/utils/i18n/core"

export const createDefaultConfig = (): ApiCredentialProfilesConfig => ({
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

/** Clones persisted JSON-compatible values across supported extension runtimes. */
export function clonePersistedValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export const cloneConfig = (config: ApiCredentialProfilesConfig) =>
  clonePersistedValue(config)

/**
 * Normalizes the tag ID list.
 */
export function normalizeTagIdList(input: unknown): string[] {
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
export function coerceOptionalTimestamp(raw: unknown): number | undefined {
  const value = coerceFiniteNumber(raw)
  if (value === undefined || value <= 0) return undefined
  return Math.round(value)
}

/**
 * Normalizes an optional credential source URL for persistence.
 *
 * Keeps the full HTTP(S) URL (path/query included) because the user revisits
 * the recorded page; returns undefined for empty, malformed, or non-HTTP(S)
 * values so they are never persisted.
 */
export function normalizeSourceUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  const trimmed = raw.trim()
  return isHttpUrl(trimmed) ? trimmed : undefined
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
export function isSameTelemetryConfig(
  first: ApiCredentialTelemetryConfig,
  second: ApiCredentialTelemetryConfig,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

/**
 * Normalizes the profile base URL.
 *
 * A profile stores the protocol root: the address the user is given by the
 * provider, without the version segment each consumer adds for itself. Keeping
 * the root makes one stored value usable by both kinds of consumer — Claude Code
 * and Gemini CLI append `/v1` and `/v1beta`, the OpenAI and Anthropic SDKs only
 * append an operation path — and it is what every version before v7 stored, so
 * existing data needs no migration.
 */
export function normalizeProfileBaseUrl(
  apiType: ApiVerificationApiType,
  baseUrl: string,
): string | null {
  return toProtocolRoot(apiType, baseUrl)
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
export function getIdentityKey(
  profile: Pick<ApiCredentialProfile, "apiType" | "baseUrl" | "apiKey">,
): string {
  // Note: apiKey is intentionally part of the identity. Do not log this value.
  return `${profile.apiType}::${profile.baseUrl}::${profile.apiKey}`
}

/**
 * Avoid silently accepting an explicit header edit through identity dedupe.
 */
export function assertDuplicateRequestHeaders(
  existing: ApiCredentialProfile | undefined,
  incoming: ApiCredentialProfile,
): void {
  if (
    existing &&
    incoming.requestHeaders !== undefined &&
    JSON.stringify(normalizeHeaderOverrides(existing.requestHeaders)) !==
      JSON.stringify(incoming.requestHeaders)
  ) {
    throw new Error(
      t("apiCredentialProfiles:dialog.errors.duplicateRequestHeaders"),
    )
  }
}

/** Deduplicates profiles by identity. */
export function dedupeProfiles(profiles: ApiCredentialProfile[]): {
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
      isSameTelemetryConfig(olderTelemetryConfig, telemetryConfig) &&
        JSON.stringify(normalizeHeaderOverrides(older.requestHeaders)) ===
          JSON.stringify(normalizeHeaderOverrides(newer.requestHeaders))
        ? older.telemetrySnapshot
        : undefined,
    )

    byIdentity.set(key, {
      ...newer,
      createdAt:
        Math.min(newer.createdAt || 0, older.createdAt || 0) || newer.createdAt,
      tagIds: mergedTagIds,
      // The latest recorded source wins; an empty re-save must not wipe a
      // previously recorded one.
      sourceUrl: newer.sourceUrl || older.sourceUrl,
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
 *
 * Read-path entry point: it reports no remap, because normalizing on read must
 * not cause a write. Callers that persist the result use
 * {@link coerceApiCredentialProfilesConfigWithRemap} so de-duplication can be
 * propagated to data keyed by profile id.
 */
export function coerceApiCredentialProfilesConfig(
  raw: unknown,
  options?: { now?: number },
): ApiCredentialProfilesConfig {
  return coerceApiCredentialProfilesConfigWithRemap(raw, options).config
}

/**
 * Coerces stored profile config and reports which profile ids de-duplication
 * dropped.
 *
 * When two stored profiles share an identity (apiType + baseUrl + apiKey) only
 * the newest survives; `profileIdRemap` maps every input id to its surviving id.
 */
export function coerceApiCredentialProfilesConfigWithRemap(
  raw: unknown,
  options?: { now?: number },
): {
  config: ApiCredentialProfilesConfig
  profileIdRemap: Map<string, string>
} {
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
    const sourceUrl = normalizeSourceUrl(candidate.sourceUrl)

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
      ...(candidate.requestHeaders !== undefined
        ? { requestHeaders: normalizeHeaderOverrides(candidate.requestHeaders) }
        : {}),
      tagIds,
      notes: notes.trim(),
      ...(sourceUrl !== undefined ? { sourceUrl } : {}),
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
    config: {
      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
      profiles: deduped,
      links,
      linkTombstones,
      lastUpdated: lastUpdated || now,
    },
    profileIdRemap,
  }
}

/**
 * Merges local and remote profile configs.
 *
 * Read-path entry point; see {@link mergeApiCredentialProfilesConfigsWithRemap}
 * for the variant that also reports merged-away profile ids.
 */
export function mergeApiCredentialProfilesConfigs(params: {
  local: unknown
  incoming: unknown
  now?: number
}): ApiCredentialProfilesConfig {
  return mergeApiCredentialProfilesConfigsWithRemap(params).config
}

/**
 * Merges local and remote profile configs and reports which profile ids
 * de-duplication dropped.
 */
export function mergeApiCredentialProfilesConfigsWithRemap(params: {
  local: unknown
  incoming: unknown
  now?: number
}): {
  config: ApiCredentialProfilesConfig
  profileIdRemap: Map<string, string>
} {
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
    config: {
      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
      profiles,
      links,
      linkTombstones,
      lastUpdated: now,
    },
    profileIdRemap,
  }
}

export const createNormalizedProfile = (
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
  const sourceUrl = normalizeSourceUrl(input.sourceUrl)
  return {
    id: safeRandomUUID("api-profile"),
    name: normalizedName,
    apiType: input.apiType,
    baseUrl: normalizedBaseUrl,
    apiKey: normalizedKey,
    ...(input.requestHeaders !== undefined
      ? { requestHeaders: normalizeHeaderOverrides(input.requestHeaders) }
      : {}),
    tagIds: normalizeTagIdList(input.tagIds),
    notes: typeof input.notes === "string" ? input.notes.trim() : "",
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    telemetryConfig: coerceApiCredentialTelemetryConfig(input.telemetryConfig, {
      baseUrl: normalizedBaseUrl,
    }),
    createdAt: now,
    updatedAt: now,
  }
}

export const createNextConfig = (params: {
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
