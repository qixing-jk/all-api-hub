import { isManagedSiteType } from "~/constants/siteType"
import {
  isSafeChannelModelFilterRegex,
  sanitizeChannelFilter,
} from "~/services/managedSites/channelModelFilterRules"
import {
  CHANNEL_CONFIG_SNAPSHOT_VERSION,
  type ChannelConfigSnapshot,
  type ChannelModelFilterSettings,
  type ChannelResourceConfig,
  type ChannelResourceConfigMap,
} from "~/types/channelConfig"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import { CHANNEL_MODEL_FILTER_PROBE_IDS } from "~/types/channelModelFilters"
import {
  createManagedUpstreamResourceRef,
  getManagedUpstreamResourceRefKey,
  type ManagedUpstreamResourceRef,
} from "~/types/managedUpstreamResource"

const HISTORICAL_CHANNEL_CONFIG_TIMESTAMP = 1

type LegacyNumericChannelConfig = Omit<ChannelResourceConfig, "resourceRef">
type LegacyNumericChannelConfigMap = Record<number, LegacyNumericChannelConfig>

/** Parses an optional positive numeric channel id used only as metadata. */
export function toValidChannelId(value: unknown): number | null {
  const channelId = Number(value)
  return Number.isSafeInteger(channelId) && channelId > 0 ? channelId : null
}

/** Checks for a plain object-shaped storage or snapshot value. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/** Checks for a finite positive timestamp accepted by the snapshot schema. */
function isPositiveTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

const supportedProbeIds = new Set<string>(CHANNEL_MODEL_FILTER_PROBE_IDS)

/** Validates one canonical rule without applying behavior-changing fallbacks. */
function isCanonicalChannelModelFilterRule(
  value: unknown,
): value is ChannelModelFilterRule {
  if (!isRecord(value)) return false

  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    (value.description !== undefined &&
      typeof value.description !== "string") ||
    (value.action !== "include" && value.action !== "exclude") ||
    typeof value.enabled !== "boolean" ||
    !isPositiveTimestamp(value.createdAt) ||
    !isPositiveTimestamp(value.updatedAt) ||
    value.createdAt > value.updatedAt
  ) {
    return false
  }

  if (value.kind === "probe") {
    if (
      !Array.isArray(value.probeIds) ||
      value.probeIds.length === 0 ||
      (value.match !== "all" && value.match !== "any")
    ) {
      return false
    }

    const probeIds = value.probeIds.filter(
      (probeId): probeId is string => typeof probeId === "string",
    )
    return (
      probeIds.length === value.probeIds.length &&
      new Set(probeIds).size === probeIds.length &&
      probeIds.every((probeId) => supportedProbeIds.has(probeId))
    )
  }

  if (
    value.kind !== "pattern" ||
    typeof value.pattern !== "string" ||
    !value.pattern.trim() ||
    typeof value.isRegex !== "boolean"
  ) {
    return false
  }

  if (value.isRegex) {
    if (!isSafeChannelModelFilterRegex(value.pattern)) {
      return false
    }
  }

  return true
}

/** Validates and canonicalizes a managed upstream resource identity. */
export function normalizeResourceRef(
  value: unknown,
): ManagedUpstreamResourceRef | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const ref = value as Partial<ManagedUpstreamResourceRef>
  if (
    !isManagedSiteType(ref.managedSiteType) ||
    typeof ref.scopeKey !== "string" ||
    !ref.scopeKey.trim() ||
    typeof ref.resourceId !== "string" ||
    !ref.resourceId.trim()
  ) {
    return null
  }

  return createManagedUpstreamResourceRef({
    managedSiteType: ref.managedSiteType,
    scopeKey: ref.scopeKey,
    resourceId: ref.resourceId,
  })
}

/** Checks whether a runtime value contains a valid resource identity. */
export function isManagedUpstreamResourceRef(
  value: unknown,
): value is ManagedUpstreamResourceRef {
  return normalizeResourceRef(value) !== null
}

/** Sanitizes persisted model-filter settings and historical resource filter fields. */
function sanitizeModelFilterSettings(
  rawSettings:
    | (Partial<ChannelModelFilterSettings> & { rules?: unknown })
    | undefined,
  legacyFilters: unknown,
  fallbackTimestamp: number,
): ChannelModelFilterSettings {
  const rawRules =
    rawSettings && typeof rawSettings === "object"
      ? rawSettings.rules
      : legacyFilters
  const rules = Array.isArray(rawRules)
    ? rawRules
        .map((filter) =>
          sanitizeChannelFilter(filter, {
            fallbackTimestamp,
            idPrefix: "channel-filter",
          }),
        )
        .filter((filter): filter is ChannelModelFilterRule => Boolean(filter))
    : []

  const explicitUpdatedAt = isPositiveTimestamp(rawSettings?.updatedAt)
    ? rawSettings.updatedAt
    : fallbackTimestamp
  return {
    rules,
    updatedAt: Math.max(
      explicitUpdatedAt,
      ...rules.map((rule) => rule.updatedAt),
    ),
  }
}

/** Sanitizes one persisted resource-scoped channel configuration. */
export function sanitizeResourceConfig(
  value: unknown,
  fallbackTimestamp = HISTORICAL_CHANNEL_CONFIG_TIMESTAMP,
): ChannelResourceConfig | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const payload = value as Partial<ChannelResourceConfig> & {
    filters?: unknown
    modelFilterSettings?: Partial<ChannelModelFilterSettings> & {
      rules?: unknown
    }
  }
  const resourceRef = normalizeResourceRef(payload.resourceRef)
  if (!resourceRef) {
    return null
  }

  const modelFilterSettings = sanitizeModelFilterSettings(
    payload.modelFilterSettings,
    payload.filters,
    fallbackTimestamp,
  )
  const channelId = toValidChannelId(payload.channelId)
  const updatedAt = Math.max(
    isPositiveTimestamp(payload.updatedAt)
      ? payload.updatedAt
      : fallbackTimestamp,
    modelFilterSettings.updatedAt,
  )
  const createdAt = Math.min(
    isPositiveTimestamp(payload.createdAt)
      ? payload.createdAt
      : fallbackTimestamp,
    updatedAt,
  )

  return {
    resourceRef,
    ...(channelId !== null ? { channelId } : {}),
    modelFilterSettings,
    createdAt,
    updatedAt,
  }
}

/** Sanitizes the obsolete numeric shape exclusively for one-time migration. */
export function sanitizeLegacyNumericConfigMap(
  raw: unknown,
): LegacyNumericChannelConfigMap {
  if (!isRecord(raw)) {
    return {}
  }

  const configs: LegacyNumericChannelConfigMap = {}
  for (const [key, value] of Object.entries(raw)) {
    const channelId = toValidChannelId(key)
    if (channelId === null || !isRecord(value)) continue

    const payload = value as Partial<LegacyNumericChannelConfig> & {
      filters?: unknown
      modelFilterSettings?: Partial<ChannelModelFilterSettings> & {
        rules?: unknown
      }
    }
    if (
      !isRecord(payload.modelFilterSettings) &&
      !Array.isArray(payload.filters)
    ) {
      continue
    }
    const modelFilterSettings = sanitizeModelFilterSettings(
      payload.modelFilterSettings,
      payload.filters,
      HISTORICAL_CHANNEL_CONFIG_TIMESTAMP,
    )
    const updatedAt = Math.max(
      isPositiveTimestamp(payload.updatedAt)
        ? payload.updatedAt
        : HISTORICAL_CHANNEL_CONFIG_TIMESTAMP,
      modelFilterSettings.updatedAt,
    )
    const createdAt = Math.min(
      isPositiveTimestamp(payload.createdAt)
        ? payload.createdAt
        : HISTORICAL_CHANNEL_CONFIG_TIMESTAMP,
      updatedAt,
    )

    configs[channelId] = {
      channelId,
      modelFilterSettings,
      createdAt,
      updatedAt,
    }
  }

  return configs
}

/** Strictly validates one externally supplied snapshot entry. */
function coerceSnapshotResourceConfig(
  value: unknown,
): ChannelResourceConfig | null {
  if (!isRecord(value)) return null

  const payload = value as Partial<ChannelResourceConfig>
  const settings = payload.modelFilterSettings
  if (
    !normalizeResourceRef(payload.resourceRef) ||
    (payload.channelId !== undefined &&
      (typeof payload.channelId !== "number" ||
        toValidChannelId(payload.channelId) === null)) ||
    !isPositiveTimestamp(payload.createdAt) ||
    !isPositiveTimestamp(payload.updatedAt) ||
    payload.createdAt > payload.updatedAt ||
    !isRecord(settings) ||
    !isPositiveTimestamp(settings.updatedAt) ||
    settings.updatedAt > payload.updatedAt ||
    !Array.isArray(settings.rules) ||
    settings.rules.some(
      (rule) =>
        !isCanonicalChannelModelFilterRule(rule) ||
        rule.updatedAt > settings.updatedAt,
    )
  ) {
    return null
  }

  return sanitizeResourceConfig(value, HISTORICAL_CHANNEL_CONFIG_TIMESTAMP)
}

/** Sanitizes and rekeys persisted configs from their structured resource refs. */
export function sanitizeResourceConfigMap(
  raw: unknown,
): ChannelResourceConfigMap {
  if (!isRecord(raw)) {
    return {}
  }

  const configs: ChannelResourceConfigMap = {}
  for (const value of Object.values(raw as Record<string, unknown>)) {
    const config = sanitizeResourceConfig(value)
    if (!config) continue
    configs[getManagedUpstreamResourceRefKey(config.resourceRef)] = config
  }
  return configs
}

/** Strictly validates and canonically rekeys an external snapshot map. */
function coerceSnapshotResourceConfigMap(
  raw: unknown,
): ChannelResourceConfigMap | null {
  if (!isRecord(raw)) return null

  const configs: ChannelResourceConfigMap = {}
  for (const value of Object.values(raw)) {
    const config = coerceSnapshotResourceConfig(value)
    if (!config) return null

    const key = getManagedUpstreamResourceRefKey(config.resourceRef)
    if (configs[key]) return null
    configs[key] = config
  }
  return configs
}

/** Coerces an unknown backup value into the current scoped snapshot schema. */
export function coerceChannelConfigSnapshot(
  raw: unknown,
): ChannelConfigSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const snapshot = raw as Partial<ChannelConfigSnapshot>
  if (
    snapshot.schemaVersion !== CHANNEL_CONFIG_SNAPSHOT_VERSION ||
    !snapshot.configs ||
    typeof snapshot.configs !== "object"
  ) {
    return null
  }

  const configs = coerceSnapshotResourceConfigMap(snapshot.configs)
  if (!configs) return null

  return {
    schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION,
    configs,
  }
}

/** Merges snapshots by full resource identity, keeping the newest conflict. */
export function mergeChannelConfigSnapshots(
  local: ChannelConfigSnapshot,
  remote: ChannelConfigSnapshot | null,
): ChannelConfigSnapshot {
  const configs: ChannelResourceConfigMap = { ...local.configs }

  for (const [key, remoteConfig] of Object.entries(remote?.configs ?? {})) {
    const localConfig = configs[key]
    if (!localConfig || remoteConfig.updatedAt > localConfig.updatedAt) {
      configs[key] = remoteConfig
    }
  }

  return {
    schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION,
    configs,
  }
}
