import { Storage } from "@plasmohq/storage"

import {
  CHANNEL_CONFIG_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  coerceChannelConfigSnapshot,
  isRecord,
  mergeChannelConfigSnapshots,
  normalizeResourceRef,
  sanitizeLegacyNumericConfigMap,
  sanitizeResourceConfig,
  sanitizeResourceConfigMap,
  toValidChannelId,
} from "~/services/managedSites/configuration/channelConfigSnapshot"
import {
  CHANNEL_CONFIG_SNAPSHOT_VERSION,
  createDefaultChannelResourceConfig,
  type ChannelConfigSnapshot,
  type ChannelResourceConfig,
  type ChannelResourceConfigMap,
} from "~/types/channelConfig"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import {
  getManagedUpstreamResourceRefKey,
  normalizeManagedUpstreamResourceScopeKey,
  type ManagedUpstreamResourceRef,
} from "~/types/managedUpstreamResource"

type ManagedUpstreamResourceScope = Pick<
  ManagedUpstreamResourceRef,
  "managedSiteType" | "scopeKey"
>
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

  /** Checks only legacy rules that could supersede the selected resources' settings. */
  async hasPendingLegacyConfigsForResources(
    resourceRefs: readonly ManagedUpstreamResourceRef[],
  ): Promise<boolean> {
    return await this.withStorageWriteLock(async () => {
      const replacementState = await this.getLegacyReplacementState()
      if (replacementState)
        await this.recoverLegacyReplacement(replacementState)
      const legacy = sanitizeLegacyNumericConfigMap(
        await this.storage.get(CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_CONFIGS),
      )
      const scoped = await this.getAllConfigs()
      return resourceRefs.some((input) => {
        const ref = normalizeResourceRef(input)
        if (!ref) throw new Error("resourceRef is invalid")
        if (!/^[1-9]\d*$/.test(ref.resourceId)) return false
        const oldConfig = legacy[Number(ref.resourceId)]
        if (!oldConfig) return false
        const current = scoped[getManagedUpstreamResourceRefKey(ref)]
        // Match migration's precedence: equally recent scoped settings win.
        return (
          !current ||
          current.modelFilterSettings.configured === false ||
          oldConfig.updatedAt > current.modelFilterSettings.updatedAt
        )
      })
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
      const result: LegacyChannelConfigMigrationResult = {
        migrated: 0,
        ambiguous: 0,
        unmatched: 0,
      }
      if (!isRecord(rawLegacyConfigs)) {
        return result
      }

      const resourceConfigs = await this.getAllConfigs()
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

        const [resourceRef] = resources
        if (!resourceRef) {
          result.unmatched += 1
          continue
        }
        const resourceKey = getManagedUpstreamResourceRefKey(resourceRef)
        const existing = resourceConfigs[resourceKey]
        if (
          !existing ||
          existing.modelFilterSettings.configured === false ||
          legacyConfig.updatedAt > existing.modelFilterSettings.updatedAt
        ) {
          resourceConfigs[resourceKey] = {
            ...legacyConfig,
            ...(existing?.modelSyncExcluded !== undefined
              ? { modelSyncExcluded: existing.modelSyncExcluded }
              : {}),
            resourceRef,
            channelId,
            updatedAt: Math.max(
              legacyConfig.updatedAt,
              existing?.updatedAt ?? 0,
            ),
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

        const remainingLegacyConfigs = { ...rawLegacyConfigs }
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

  /** Changes only model-sync participation, preserving concurrent filter edits. */
  async setModelSyncExcluded(
    resourceRef: ManagedUpstreamResourceRef,
    excluded: boolean,
  ): Promise<void> {
    const normalizedRef = normalizeResourceRef(resourceRef)
    if (!normalizedRef || typeof excluded !== "boolean") {
      throw new Error("Model sync exclusion is invalid")
    }
    await this.withStorageWriteLock(async () => {
      const configs = await this.getAllConfigs()
      const existing = configs[getManagedUpstreamResourceRefKey(normalizedRef)]
      const current =
        existing ?? createDefaultChannelResourceConfig(normalizedRef)
      await this.saveSanitizedConfig({
        ...current,
        modelSyncExcluded: excluded,
        // Creating participation settings must not supersede unmigrated filters.
        modelFilterSettings: existing?.modelFilterSettings ?? {
          ...current.modelFilterSettings,
          configured: false,
        },
      })
    })
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

  /** Replaces model filters atomically, preserving sync participation unless supplied. */
  async upsertFilters(
    resourceRef: ManagedUpstreamResourceRef,
    rules: ChannelModelFilterRule[],
    options: { channelId?: number; modelSyncExcluded?: boolean } = {},
  ): Promise<void> {
    const { modelSyncExcluded } = options
    if (
      modelSyncExcluded !== undefined &&
      typeof modelSyncExcluded !== "boolean"
    ) {
      throw new Error("Model sync exclusion is invalid")
    }
    const channelId = toValidChannelId(options.channelId)
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
        ...(modelSyncExcluded !== undefined ? { modelSyncExcluded } : {}),
        modelFilterSettings: {
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
