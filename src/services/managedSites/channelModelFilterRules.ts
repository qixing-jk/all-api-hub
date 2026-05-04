import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification"
import type {
  ChannelFilterAction,
  ChannelModelFilterRule,
  ChannelModelPatternFilterRule,
  ChannelModelProbeFilterMatchMode,
  ChannelModelProbeFilterRule,
} from "~/types/channelModelFilters"
import { CHANNEL_MODEL_FILTER_PROBE_IDS } from "~/types/channelModelFilters"
import { safeRandomUUID } from "~/utils/core/identifier"

const FILTER_CREDENTIAL_FIELD_NAMES = new Set([
  "apiKey",
  "api_key",
  "baseUrl",
  "base_url",
  "channelKey",
  "copiedCredential",
  "credential",
  "credentials",
  "key",
  "manualApiKey",
  "manualBaseUrl",
  "token",
])

export type IncomingChannelFilter = Partial<ChannelModelFilterRule> & {
  [key: string]: unknown
}

interface NormalizeChannelFiltersOptions {
  idPrefix?: string
  now?: number
}

interface SanitizeChannelFilterOptions extends NormalizeChannelFiltersOptions {
  fallbackTimestamp: number
}

const supportedProbeIds = new Set<ApiVerificationProbeId>(
  CHANNEL_MODEL_FILTER_PROBE_IDS,
)

/**
 * Normalize unknown rule action values into the supported include/exclude set.
 */
function normalizeAction(action: unknown): ChannelFilterAction {
  return action === "exclude" ? "exclude" : "include"
}

/**
 * Normalize future probe match modes, defaulting current UI writes to all.
 */
function normalizeMatchMode(match: unknown): ChannelModelProbeFilterMatchMode {
  return match === "any" ? "any" : "all"
}

/**
 * Return unique supported probe identifiers from an arbitrary payload.
 */
function normalizeProbeIds(rawProbeIds: unknown): ApiVerificationProbeId[] {
  if (!Array.isArray(rawProbeIds)) {
    return []
  }

  const unique = new Set<ApiVerificationProbeId>()
  for (const rawProbeId of rawProbeIds) {
    if (typeof rawProbeId !== "string") {
      continue
    }

    const probeId = rawProbeId.trim() as ApiVerificationProbeId
    if (supportedProbeIds.has(probeId)) {
      unique.add(probeId)
    }
  }

  return [...unique]
}

/**
 * Read a positive timestamp or fall back to the caller-provided value.
 */
function getTimestamp(raw: unknown, fallbackTimestamp: number) {
  return typeof raw === "number" && raw > 0 ? raw : fallbackTimestamp
}

/**
 * Normalize fields shared by all channel model filter rule kinds.
 */
function normalizeCommonFields(
  payload: IncomingChannelFilter,
  options: Required<NormalizeChannelFiltersOptions>,
) {
  const name = typeof payload.name === "string" ? payload.name.trim() : ""
  if (!name) {
    throw new Error("Filter name is required")
  }

  const description =
    typeof payload.description === "string" && payload.description.trim()
      ? payload.description.trim()
      : undefined

  const createdAt = getTimestamp(payload.createdAt, options.now)

  return {
    id:
      typeof payload.id === "string" && payload.id.trim()
        ? payload.id.trim()
        : safeRandomUUID(options.idPrefix),
    name,
    description,
    action: normalizeAction(payload.action),
    enabled: payload.enabled !== false,
    createdAt,
    updatedAt: options.now,
  }
}

/**
 * Normalize a pattern-backed rule and validate its optional regex.
 */
function normalizePatternFilter(
  payload: IncomingChannelFilter,
  options: Required<NormalizeChannelFiltersOptions>,
): ChannelModelPatternFilterRule {
  const pattern =
    typeof payload.pattern === "string" ? payload.pattern.trim() : ""
  if (!pattern) {
    throw new Error("Filter pattern is required")
  }

  if (payload.isRegex) {
    try {
      new RegExp(pattern)
    } catch (error) {
      throw new Error(`Invalid regex pattern: ${(error as Error).message}`)
    }
  }

  return {
    ...normalizeCommonFields(payload, options),
    kind: "pattern",
    pattern,
    isRegex: Boolean(payload.isRegex),
  }
}

/**
 * Normalize a probe-backed rule while retaining only safe rule metadata.
 */
function normalizeProbeFilter(
  payload: IncomingChannelFilter,
  options: Required<NormalizeChannelFiltersOptions>,
): ChannelModelProbeFilterRule {
  const probeIds = normalizeProbeIds(payload.probeIds)
  if (probeIds.length === 0) {
    throw new Error("At least one probe is required")
  }

  const normalized = {
    ...normalizeCommonFields(payload, options),
    kind: "probe" as const,
    probeIds,
    match: normalizeMatchMode(payload.match),
  }

  return stripCredentialFields(normalized) as ChannelModelProbeFilterRule
}

/**
 * Normalize one incoming rule, treating legacy rules without kind as pattern rules.
 */
function normalizeChannelFilter(
  filter: IncomingChannelFilter,
  options: NormalizeChannelFiltersOptions = {},
): ChannelModelFilterRule {
  const normalizedOptions = {
    idPrefix: options.idPrefix ?? "channel-filter",
    now: options.now ?? Date.now(),
  }
  const kind = filter.kind === "probe" ? "probe" : "pattern"

  return kind === "probe"
    ? normalizeProbeFilter(filter, normalizedOptions)
    : normalizePatternFilter(filter, normalizedOptions)
}

/**
 * Normalize an incoming rule array for runtime persistence or JSON imports.
 */
export function normalizeChannelFilters(
  filters: IncomingChannelFilter[],
  options: NormalizeChannelFiltersOptions = {},
): ChannelModelFilterRule[] {
  if (!Array.isArray(filters)) {
    throw new Error("Filters must be an array")
  }

  const now = options.now ?? Date.now()
  return filters.map((filter) =>
    normalizeChannelFilter(filter, {
      ...options,
      now,
    }),
  )
}

/**
 * Remove credential-like fields from imported or user-authored rule payloads.
 */
function stripCredentialFields<T extends Record<string, unknown>>(
  payload: T,
): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (!FILTER_CREDENTIAL_FIELD_NAMES.has(key)) {
      result[key] = value
    }
  }
  return result as T
}

/**
 * Best-effort sanitize one stored rule, returning null when it is not executable.
 */
export function sanitizeChannelFilter(
  filter: unknown,
  options: SanitizeChannelFilterOptions,
): ChannelModelFilterRule | null {
  if (!filter || typeof filter !== "object") {
    return null
  }

  const payload = stripCredentialFields(
    filter as Record<string, unknown>,
  ) as IncomingChannelFilter

  try {
    const normalized = normalizeChannelFilter(payload, {
      idPrefix: options.idPrefix,
      now: options.fallbackTimestamp,
    })

    return {
      ...normalized,
      createdAt: getTimestamp(payload.createdAt, options.fallbackTimestamp),
      updatedAt: getTimestamp(payload.updatedAt, options.fallbackTimestamp),
    }
  } catch {
    return null
  }
}

/**
 * Best-effort sanitize a stored or imported filter rule array.
 */
export function sanitizeChannelFiltersForStorage(
  filters: unknown,
  options: NormalizeChannelFiltersOptions = {},
): ChannelModelFilterRule[] {
  if (!Array.isArray(filters)) {
    return []
  }

  const fallbackTimestamp = options.now ?? Date.now()
  return filters
    .map((filter) =>
      sanitizeChannelFilter(filter, {
        fallbackTimestamp,
        idPrefix: options.idPrefix ?? "channel-filter",
      }),
    )
    .filter((filter): filter is ChannelModelFilterRule => Boolean(filter))
}
