import { Storage } from "@plasmohq/storage"

import { MANAGED_SITE_TYPES } from "~/constants/siteType"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import {
  CHANNEL_CONFIG_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import {
  getManagedSiteChannelResourceId,
  getStableLegacyChannelId,
} from "~/services/managedSites/managedSiteChannelResourceIdentity"
import { getManagedSiteServiceForType } from "~/services/managedSites/managedSiteService"
import {
  hasManagedSiteRuntimeConfigInputForType,
  resolveManagedSiteRuntimeConfigForType,
  type ManagedSiteRuntimeConfig,
} from "~/services/managedSites/runtimeConfig"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import {
  createManagedUpstreamResourceRef,
  normalizeManagedUpstreamResourceScopeKey,
} from "~/types/managedUpstreamResource"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("LegacyChannelConfigMigration")
const LEGACY_CHANNEL_INVENTORY_TIMEOUT_MS = 30_000
const INITIAL_RETRY_DELAY_MS = 5 * 60_000
const MAX_RETRY_DELAY_MS = 6 * 60 * 60_000

type LegacyChannelConfigMigrationRetryState = {
  attempt: number
  retryAfter: number
}

type ManagedSiteInventoryTargets = {
  targets: ManagedSiteRuntimeConfig[]
  hasIncompleteConfig: boolean
}

/** Resolves complete deployment configs while detecting partial user input. */
function resolveInventoryTargets(
  preferences: UserPreferences,
): ManagedSiteInventoryTargets {
  const targets: ManagedSiteRuntimeConfig[] = []
  let hasIncompleteConfig = false

  for (const siteType of MANAGED_SITE_TYPES) {
    const target = resolveManagedSiteRuntimeConfigForType(preferences, siteType)
    if (target) {
      targets.push(target)
    } else if (hasManagedSiteRuntimeConfigInputForType(preferences, siteType)) {
      hasIncompleteConfig = true
    }
  }

  return { targets, hasIncompleteConfig }
}

/** Builds a deterministic identity for the deployment set being enumerated. */
function getInventoryTargetFingerprint(
  targets: ManagedSiteRuntimeConfig[],
): string {
  return targets
    .map(
      (target) =>
        `${target.siteType}:${normalizeManagedUpstreamResourceScopeKey(target.config.baseUrl)}`,
    )
    .sort()
    .join("\n")
}

export type LegacyChannelConfigMigrationOutcome =
  | { status: "not-needed" }
  | {
      status: "completed"
      migrated: number
      ambiguous: number
      unmatched: number
    }
  | {
      status: "deferred"
      reason:
        | "no-configured-sites"
        | "inventory-failed"
        | "storage-failed"
        | "backoff-active"
        | "unresolved-identities"
    }

/**
 * Discovers every configured deployment before resolving legacy numeric ids.
 * A shared promise deduplicates callers within one extension context.
 */
class LegacyChannelConfigMigration {
  private readonly storage = new Storage({ area: "local" })
  private initializationPromise: Promise<LegacyChannelConfigMigrationOutcome> | null =
    null

  initialize(options?: {
    bypassBackoff?: boolean
  }): Promise<LegacyChannelConfigMigrationOutcome> {
    if (!this.initializationPromise) {
      const runPromise = this.run(options?.bypassBackoff ?? false)
      this.initializationPromise = runPromise
      void runPromise.then(
        () => this.clearInitializationPromise(runPromise),
        () => this.clearInitializationPromise(runPromise),
      )
    }
    return this.initializationPromise
  }

  private clearInitializationPromise(
    runPromise: Promise<LegacyChannelConfigMigrationOutcome>,
  ): void {
    if (this.initializationPromise === runPromise) {
      this.initializationPromise = null
    }
  }

  private async readRetryState(): Promise<LegacyChannelConfigMigrationRetryState | null> {
    const raw = await this.storage.get(
      CHANNEL_CONFIG_STORAGE_KEYS.LEGACY_MIGRATION_STATE,
    )
    if (!raw || typeof raw !== "object") return null

    const candidate = raw as Partial<LegacyChannelConfigMigrationRetryState>
    return Number.isInteger(candidate.attempt) &&
      Number(candidate.attempt) >= 1 &&
      Number.isFinite(candidate.retryAfter) &&
      Number(candidate.retryAfter) > 0
      ? {
          attempt: Number(candidate.attempt),
          retryAfter: Number(candidate.retryAfter),
        }
      : null
  }

  private async defer(
    reason: Exclude<
      Extract<
        LegacyChannelConfigMigrationOutcome,
        { status: "deferred" }
      >["reason"],
      "backoff-active"
    >,
  ): Promise<LegacyChannelConfigMigrationOutcome> {
    try {
      const previous = await this.readRetryState()
      const attempt = Math.min((previous?.attempt ?? 0) + 1, 16)
      const retryDelay = Math.min(
        INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1),
        MAX_RETRY_DELAY_MS,
      )
      await this.storage.set(
        CHANNEL_CONFIG_STORAGE_KEYS.LEGACY_MIGRATION_STATE,
        {
          attempt,
          retryAfter: Date.now() + retryDelay,
        } satisfies LegacyChannelConfigMigrationRetryState,
      )
    } catch (error) {
      logger.warn("Failed to persist legacy channel migration backoff", error)
    }
    return { status: "deferred", reason }
  }

  private async clearRetryState(): Promise<void> {
    try {
      await this.storage.remove(
        CHANNEL_CONFIG_STORAGE_KEYS.LEGACY_MIGRATION_STATE,
      )
    } catch (error) {
      logger.warn("Failed to clear legacy channel migration backoff", error)
    }
  }

  private async run(
    bypassBackoff: boolean,
  ): Promise<LegacyChannelConfigMigrationOutcome> {
    try {
      return await withExtensionStorageWriteLock(
        STORAGE_LOCKS.LEGACY_CHANNEL_CONFIG_MIGRATION,
        async () => await this.runExclusive(bypassBackoff),
      )
    } catch (error) {
      logger.warn("Legacy numeric channel config migration deferred", error)
      return await this.defer("storage-failed")
    }
  }

  private async runExclusive(
    bypassBackoff: boolean,
  ): Promise<LegacyChannelConfigMigrationOutcome> {
    try {
      if (!(await channelConfigStorage.hasLegacyNumericConfigs())) {
        await this.clearRetryState()
        return { status: "not-needed" }
      }

      const retryState = await this.readRetryState()
      if (!bypassBackoff && retryState && retryState.retryAfter > Date.now()) {
        return { status: "deferred", reason: "backoff-active" }
      }

      const preferences = await userPreferences.getPreferencesStrict()
      const inventoryTargets = resolveInventoryTargets(preferences)
      const { targets } = inventoryTargets

      if (inventoryTargets.hasIncompleteConfig) {
        return await this.defer("inventory-failed")
      }

      if (targets.length === 0) {
        return await this.defer("no-configured-sites")
      }

      const inventoryResults = await Promise.allSettled(
        targets.map(async (target) => {
          const service = getManagedSiteServiceForType(target.siteType)
          const channels = await runAbortableTask(
            async (signal) =>
              await service.listChannels(target.config, {
                signal,
                requireCompleteInventory: true,
              }),
            { timeoutMs: LEGACY_CHANNEL_INVENTORY_TIMEOUT_MS },
          )

          if (channels.items.length < channels.total) {
            throw new Error("Managed-site channel inventory is incomplete")
          }

          return channels.items.flatMap((channel) => {
            const channelId = getStableLegacyChannelId(target.siteType, channel)
            return channelId === null
              ? []
              : [
                  {
                    channelId,
                    resourceRef: createManagedUpstreamResourceRef({
                      managedSiteType: target.siteType,
                      scopeKey: target.config.baseUrl,
                      resourceId: getManagedSiteChannelResourceId(
                        target.siteType,
                        channel,
                      ),
                    }),
                  },
                ]
          })
        }),
      )

      const failedCount = inventoryResults.filter(
        (result) => result.status === "rejected",
      ).length
      if (failedCount > 0) {
        logger.warn("Legacy channel config inventory is incomplete", {
          configuredSiteCount: targets.length,
          failedSiteCount: failedCount,
        })
        return await this.defer("inventory-failed")
      }

      const currentPreferences = await userPreferences.getPreferencesStrict()
      const currentInventoryTargets =
        resolveInventoryTargets(currentPreferences)
      if (
        currentInventoryTargets.hasIncompleteConfig ||
        getInventoryTargetFingerprint(currentInventoryTargets.targets) !==
          getInventoryTargetFingerprint(targets)
      ) {
        logger.warn("Managed-site configuration changed during migration")
        return await this.defer("inventory-failed")
      }

      const candidates = inventoryResults.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      )
      const migrated =
        await channelConfigStorage.migrateLegacyNumericConfigs(candidates)
      if (migrated.ambiguous > 0 || migrated.unmatched > 0) {
        logger.warn(
          "Legacy numeric channel configs remain unresolved",
          migrated,
        )
        return await this.defer("unresolved-identities")
      }
      await this.clearRetryState()
      logger.info("Legacy numeric channel config migration completed", migrated)
      return { status: "completed", ...migrated }
    } catch (error) {
      logger.warn("Legacy numeric channel config migration deferred", error)
      return await this.defer("storage-failed")
    }
  }
}

/** Ensures legacy numeric data is resolved before a scoped-only consumer runs. */
export async function ensureLegacyChannelConfigMigrationReady(options?: {
  bypassBackoff?: boolean
}): Promise<void> {
  const outcome = await legacyChannelConfigMigration.initialize(options)
  if (outcome.status === "deferred") {
    throw new Error(
      `Legacy channel config migration deferred: ${outcome.reason}`,
    )
  }
}

export const legacyChannelConfigMigration = new LegacyChannelConfigMigration()
