import { Storage } from "@plasmohq/storage"

import { isManagedSiteType } from "~/constants/siteType"
import {
  CHANNEL_CONFIG_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  ChannelConfigMessageTypes,
  onChannelConfigMessage,
  type ChannelConfigGetRequest,
  type ChannelConfigGetResponse,
  type ChannelConfigUpsertFiltersRequest,
  type ChannelConfigUpsertFiltersResponse,
} from "~/services/managedSites/channelConfigMessaging"
import { createRuntimeMessageFailure } from "~/services/runtimeMessaging/result"
import {
  CHANNEL_CONFIG_SNAPSHOT_VERSION,
  createDefaultChannelResourceConfig,
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
  normalizeManagedUpstreamResourceScopeKey,
  type ManagedUpstreamResourceRef,
} from "~/types/managedUpstreamResource"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import {
  isSafeChannelModelFilterRegex,
  normalizeChannelFilters,
  sanitizeChannelFilter,
  type IncomingChannelFilter,
} from "./channelModelFilterRules"

const logger = createLogger("ChannelConfigStorage")

const HISTORICAL_CHANNEL_CONFIG_TIMESTAMP = 1

type ManagedUpstreamResourceScope = Pick<
  ManagedUpstreamResourceRef,
  "managedSiteType" | "scopeKey"
>

type LegacyNumericChannelConfig = Omit<ChannelResourceConfig, "resourceRef">
type LegacyNumericChannelConfigMap = Record<number, LegacyNumericChannelConfig>
type LegacyReplacementState =
  | {
      phase: "prepared"
      snapshot: ChannelConfigSnapshot
    }
  | {
      phase: "committed"
    }

export type LegacyChannelConfigMigrationCandidate = {
  channelId: number
  resourceRef: ManagedUpstreamResourceRef
}

export type LegacyChannelConfigMigrationResult = {
  migrated: number
  ambiguous: number
  unmatched: number
}

/** Parses an optional positive numeric channel id used only as metadata. */
function toValidChannelId(value: unknown): number | null {
  const channelId = Number(value)
  return Number.isSafeInteger(channelId) && channelId > 0 ? channelId : null
}

/** Checks for a plain object-shaped storage or snapshot value. */
function isRecord(value: unknown): value is Record<string, unknown> {
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
function normalizeResourceRef(
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
function isManagedUpstreamResourceRef(
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
        .map((rule) => {
          const updatedAt = isPositiveTimestamp(rule.updatedAt)
            ? rule.updatedAt
            : fallbackTimestamp
          const createdAt = isPositiveTimestamp(rule.createdAt)
            ? Math.min(rule.createdAt, updatedAt)
            : fallbackTimestamp
          return { ...rule, createdAt, updatedAt }
        })
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
function sanitizeResourceConfig(
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
function sanitizeLegacyNumericConfigMap(
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
function sanitizeResourceConfigMap(raw: unknown): ChannelResourceConfigMap {
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
function mergeChannelConfigSnapshots(
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

/** Owns the single resource-scoped persistence authority for channel settings. */
class ChannelConfigStorage {
  private storage: Storage

  constructor() {
    this.storage = new Storage({ area: "local" })
  }

  private async withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    return withExtensionStorageWriteLock(STORAGE_LOCKS.CHANNEL_CONFIG, work)
  }

  private async getLegacyReplacementState(): Promise<LegacyReplacementState | null> {
    const rawState = await this.storage.get(
      CHANNEL_CONFIG_STORAGE_KEYS.LEGACY_REPLACEMENT_STATE,
    )
    if (rawState === null || rawState === undefined) {
      return null
    }
    if (isRecord(rawState) && rawState.phase === "committed") {
      return { phase: "committed" }
    }
    if (isRecord(rawState) && rawState.phase === "prepared") {
      const snapshot = coerceChannelConfigSnapshot(rawState.snapshot)
      if (snapshot) {
        return { phase: "prepared", snapshot }
      }
    }
    throw new Error("Channel config snapshot replacement state is invalid")
  }

  private async assertNoIncompleteLegacyReplacement(): Promise<void> {
    if ((await this.getLegacyReplacementState()) !== null) {
      throw new Error("Channel config snapshot replacement is incomplete")
    }
  }

  /** Finalizes cleanup after a scoped replacement has been durably committed. */
  private async finalizeCommittedLegacyReplacement(): Promise<void> {
    await this.storage.remove(CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_CONFIGS)
    await this.storage.remove(
      CHANNEL_CONFIG_STORAGE_KEYS.LEGACY_REPLACEMENT_STATE,
    )
  }

  /** Replays or finalizes a durable scoped-replacement transaction. */
  private async recoverLegacyReplacement(
    state: LegacyReplacementState,
  ): Promise<void> {
    if (state.phase === "prepared") {
      await this.storage.set(
        CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_RESOURCE_CONFIGS,
        state.snapshot.configs,
      )
      await this.storage.set(
        CHANNEL_CONFIG_STORAGE_KEYS.LEGACY_REPLACEMENT_STATE,
        { phase: "committed" } satisfies LegacyReplacementState,
      )
    }
    await this.finalizeCommittedLegacyReplacement()
  }

  /** Loads every resource-scoped configuration from authoritative storage. */
  private async getAllConfigs(): Promise<ChannelResourceConfigMap> {
    await this.assertNoIncompleteLegacyReplacement()
    const stored = await this.storage.get(
      CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_RESOURCE_CONFIGS,
    )
    return sanitizeResourceConfigMap(stored)
  }

  /** Returns whether valid legacy numeric data remains available to migrate. */
  async hasLegacyNumericConfigs(): Promise<boolean> {
    return await this.withStorageWriteLock(async () => {
      const replacementState = await this.getLegacyReplacementState()
      if (replacementState) {
        await this.recoverLegacyReplacement(replacementState)
        return false
      }

      const stored = await this.storage.get(
        CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_CONFIGS,
      )
      return Object.keys(sanitizeLegacyNumericConfigMap(stored)).length > 0
    })
  }

  /**
   * Resolves legacy numeric configs against a complete discovered inventory.
   *
   * Callers must supply candidates only after every configured deployment was
   * enumerated successfully. Zero/multiple candidates are deliberately not
   * guessed. Uniquely resolved configs are persisted before only their numeric
   * predecessors are removed; unresolved entries remain retryable.
   */
  async migrateLegacyNumericConfigs(
    candidates: LegacyChannelConfigMigrationCandidate[],
  ): Promise<LegacyChannelConfigMigrationResult> {
    const candidatesByChannelId = new Map<
      number,
      Map<string, ManagedUpstreamResourceRef>
    >()

    for (const candidate of candidates) {
      const channelId = toValidChannelId(candidate.channelId)
      const resourceRef = normalizeResourceRef(candidate.resourceRef)
      if (channelId === null || !resourceRef) continue

      const resources = candidatesByChannelId.get(channelId) ?? new Map()
      resources.set(getManagedUpstreamResourceRefKey(resourceRef), resourceRef)
      candidatesByChannelId.set(channelId, resources)
    }

    return this.withStorageWriteLock(async () => {
      await this.assertNoIncompleteLegacyReplacement()
      const rawLegacyConfigs = await this.storage.get<unknown>(
        CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_CONFIGS,
      )
      const legacyConfigs = sanitizeLegacyNumericConfigMap(rawLegacyConfigs)
      const resourceConfigs = await this.getAllConfigs()
      const result: LegacyChannelConfigMigrationResult = {
        migrated: 0,
        ambiguous: 0,
        unmatched: 0,
      }
      const migratedChannelIds = new Set<number>()

      for (const [channelIdKey, legacyConfig] of Object.entries(
        legacyConfigs,
      )) {
        const channelId = Number(channelIdKey)
        const resources = Array.from(
          candidatesByChannelId.get(channelId)?.values() ?? [],
        )

        if (resources.length === 0) {
          result.unmatched += 1
          continue
        }
        if (resources.length > 1) {
          result.ambiguous += 1
          continue
        }

        const resourceRef = resources[0]
        const resourceKey = getManagedUpstreamResourceRefKey(resourceRef)
        const existing = resourceConfigs[resourceKey]
        if (!existing || legacyConfig.updatedAt > existing.updatedAt) {
          resourceConfigs[resourceKey] = {
            ...legacyConfig,
            resourceRef,
            channelId,
            createdAt: existing
              ? Math.min(existing.createdAt, legacyConfig.createdAt)
              : legacyConfig.createdAt,
          }
        } else if (existing.channelId !== channelId) {
          resourceConfigs[resourceKey] = { ...existing, channelId }
        }
        result.migrated += 1
        migratedChannelIds.add(channelId)
      }

      if (result.migrated > 0) {
        await this.storage.set(
          CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_RESOURCE_CONFIGS,
          resourceConfigs,
        )

        const remainingLegacyConfigs = isRecord(rawLegacyConfigs)
          ? { ...rawLegacyConfigs }
          : {}
        for (const key of Object.keys(remainingLegacyConfigs)) {
          const channelId = toValidChannelId(key)
          if (channelId !== null && migratedChannelIds.has(channelId)) {
            delete remainingLegacyConfigs[key]
          }
        }

        if (Object.keys(remainingLegacyConfigs).length > 0) {
          await this.storage.set(
            CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_CONFIGS,
            remainingLegacyConfigs,
          )
        } else {
          await this.storage.remove(CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_CONFIGS)
        }
      }
      return result
    })
  }

  /** Loads configurations belonging to one managed-site type and deployment scope. */
  async getConfigsForScope(
    scope: ManagedUpstreamResourceScope,
  ): Promise<ChannelResourceConfigMap> {
    const configs = await this.getAllConfigs()
    const normalizedScopeKey = normalizeManagedUpstreamResourceScopeKey(
      scope.scopeKey,
    )

    return Object.fromEntries(
      Object.entries(configs).filter(
        ([, config]) =>
          config.resourceRef.managedSiteType === scope.managedSiteType &&
          config.resourceRef.scopeKey === normalizedScopeKey,
      ),
    )
  }

  /** Loads one resource configuration or returns an unsaved default. */
  async getConfig(
    resourceRef: ManagedUpstreamResourceRef,
  ): Promise<ChannelResourceConfig> {
    const normalizedRef = normalizeResourceRef(resourceRef)
    if (!normalizedRef) {
      throw new Error("resourceRef is invalid")
    }

    const configs = await this.getAllConfigs()
    return (
      configs[getManagedUpstreamResourceRefKey(normalizedRef)] ??
      createDefaultChannelResourceConfig(normalizedRef)
    )
  }

  /** Persists a validated config while the caller owns the storage write lock. */
  private async saveSanitizedConfig(
    sanitized: ChannelResourceConfig,
  ): Promise<void> {
    const configs = await this.getAllConfigs()
    const resourceKey = getManagedUpstreamResourceRefKey(sanitized.resourceRef)
    await this.storage.set(
      CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_RESOURCE_CONFIGS,
      {
        ...configs,
        [resourceKey]: {
          ...sanitized,
          updatedAt: Date.now(),
        },
      },
    )
  }

  /** Exports the complete resource-scoped configuration snapshot. */
  async exportConfigs(): Promise<ChannelConfigSnapshot> {
    return {
      schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION,
      configs: await this.getAllConfigs(),
    }
  }

  /** Replaces authoritative storage with a validated scoped snapshot. */
  async importConfigs(rawSnapshot: unknown): Promise<number> {
    const snapshot = coerceChannelConfigSnapshot(rawSnapshot)
    if (!snapshot) {
      throw new Error("Channel config snapshot is invalid")
    }

    await this.withStorageWriteLock(async () => {
      const replacementState = await this.getLegacyReplacementState()
      if (replacementState) {
        await this.recoverLegacyReplacement(replacementState)
      }

      const legacySource = await this.storage.get(
        CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_CONFIGS,
      )
      const hasLegacySource = isRecord(legacySource)
        ? Object.keys(legacySource).length > 0
        : legacySource !== null && legacySource !== undefined
      const needsLegacyCleanup = hasLegacySource

      if (needsLegacyCleanup) {
        await this.storage.set(
          CHANNEL_CONFIG_STORAGE_KEYS.LEGACY_REPLACEMENT_STATE,
          {
            phase: "prepared",
            snapshot,
          } satisfies LegacyReplacementState,
        )
      }
      await this.storage.set(
        CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_RESOURCE_CONFIGS,
        snapshot.configs,
      )
      if (needsLegacyCleanup) {
        await this.storage.set(
          CHANNEL_CONFIG_STORAGE_KEYS.LEGACY_REPLACEMENT_STATE,
          { phase: "committed" } satisfies LegacyReplacementState,
        )
        // A committed replacement supersedes the obsolete migration source.
        // The marker lets a later startup finish cleanup without resurrecting it.
        await this.finalizeCommittedLegacyReplacement()
      }
    })
    return Object.keys(snapshot.configs).length
  }

  /** Atomically merges a validated snapshot with the latest persisted state. */
  async mergeConfigs(rawSnapshot: unknown): Promise<ChannelConfigSnapshot> {
    const incoming = coerceChannelConfigSnapshot(rawSnapshot)
    if (!incoming) {
      throw new Error("Channel config snapshot is invalid")
    }

    return this.withStorageWriteLock(async () => {
      const merged = mergeChannelConfigSnapshots(
        {
          schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION,
          configs: await this.getAllConfigs(),
        },
        incoming,
      )
      await this.storage.set(
        CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_RESOURCE_CONFIGS,
        merged.configs,
      )
      return merged
    })
  }

  /** Replaces model filter rules for one resource identity. */
  async upsertFilters(
    resourceRef: ManagedUpstreamResourceRef,
    rules: ChannelModelFilterRule[],
    channelIdInput?: number,
  ): Promise<void> {
    const channelId = toValidChannelId(channelIdInput)
    const normalizedRef = normalizeResourceRef(resourceRef)
    if (!normalizedRef) {
      throw new Error("resourceRef is invalid")
    }

    await this.withStorageWriteLock(async () => {
      const timestamp = Date.now()
      const current = await this.getConfig(normalizedRef)
      const updated = sanitizeResourceConfig({
        ...current,
        resourceRef: normalizedRef,
        ...(channelId !== null ? { channelId } : {}),
        modelFilterSettings: {
          ...current.modelFilterSettings,
          rules,
          updatedAt: timestamp,
        },
        updatedAt: timestamp,
        createdAt: current.createdAt || timestamp,
      })
      if (!updated) {
        throw new Error("Channel resource config is invalid")
      }
      await this.saveSanitizedConfig(updated)
    })
  }
}

export const channelConfigStorage = new ChannelConfigStorage()

/** Normalizes filter inputs received through the runtime messaging boundary. */
function normalizeFilters(
  filters: Array<IncomingChannelFilter | ChannelModelFilterRule>,
): ChannelModelFilterRule[] {
  return normalizeChannelFilters(filters as IncomingChannelFilter[], {
    idPrefix: "channel-filter",
  })
}

let channelConfigMessagingCleanup: (() => void)[] | null = null

/** Registers channel-config runtime listeners once per background lifetime. */
export function setupChannelConfigMessagingListeners() {
  if (channelConfigMessagingCleanup) {
    return
  }

  channelConfigMessagingCleanup = [
    onChannelConfigMessage(ChannelConfigMessageTypes.Get, ({ data }) =>
      resolveChannelConfigGetMessage(data),
    ),
    onChannelConfigMessage(
      ChannelConfigMessageTypes.UpsertFilters,
      ({ data }) => resolveChannelConfigUpsertFiltersMessage(data),
    ),
  ]
}

/** Resolves a resource-scoped channel-config read message. */
export async function resolveChannelConfigGetMessage(
  request: ChannelConfigGetRequest,
): Promise<ChannelConfigGetResponse> {
  try {
    if (!isManagedUpstreamResourceRef(request.resourceRef)) {
      throw new Error("resourceRef is invalid")
    }

    return {
      success: true,
      data: await channelConfigStorage.getConfig(request.resourceRef),
    }
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/** Resolves a resource-scoped channel-filter write message. */
export async function resolveChannelConfigUpsertFiltersMessage(
  request: ChannelConfigUpsertFiltersRequest,
): Promise<ChannelConfigUpsertFiltersResponse> {
  try {
    if (!isManagedUpstreamResourceRef(request.resourceRef)) {
      throw new Error("resourceRef is invalid")
    }

    const normalizedFilters = normalizeFilters(request.filters ?? [])
    await channelConfigStorage.upsertFilters(
      request.resourceRef,
      normalizedFilters,
      request.channelId,
    )
    return { success: true, data: normalizedFilters }
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}
