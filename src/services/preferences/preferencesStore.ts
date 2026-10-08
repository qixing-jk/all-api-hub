import { Storage } from "@plasmohq/storage"

import {
  STORAGE_LOCKS,
  USER_PREFERENCES_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { featureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"
import {
  CURRENT_PREFERENCES_VERSION,
  migratePreferences,
} from "~/services/preferences/migrations/preferencesMigration"
import { normalizeTempWindowFallbackPreferences } from "~/services/preferences/tempWindowFallbackPreferences"
import {
  getSharedPreferencesLastUpdated,
  normalizeSharedPreferencesMetadata,
  patchTouchesSharedPreferences,
  restoreWebdavLocalOnlyPreferences,
} from "~/services/preferences/webdavSharedPreferences"
import { ACCOUNT_KEY_AUTO_PROVISION_MODES } from "~/types/accountKeyAutoProvisioning"
import { normalizeAppearance } from "~/types/theme"
import { type DeepPartial } from "~/types/utils"
import { CLOUD_SYNC_PROVIDERS } from "~/types/webdav"
import { deepOverride } from "~/utils"
import { createLogger } from "~/utils/core/logger"

import {
  createDefaultPreferences,
  DEFAULT_PREFERENCES,
} from "./preferencesDefaults"
import { type UserPreferences } from "./preferencesSchema"

const logger = createLogger("UserPreferences")
export const PREFERENCE_WRITE_FAILURE_TYPES = {
  Stale: "stale",
  StorageError: "storage-error",
} as const

export type PreferenceWriteConflict = {
  type: typeof PREFERENCE_WRITE_FAILURE_TYPES.Stale
  expectedLastUpdated: number
  actualLastUpdated: number
}

export type PreferenceWriteFailure =
  | PreferenceWriteConflict
  | {
      type: typeof PREFERENCE_WRITE_FAILURE_TYPES.StorageError
      error: unknown
    }

export type PreferenceWriteResult =
  | {
      ok: true
      preferences: UserPreferences
    }
  | {
      ok: false
      reason: PreferenceWriteFailure
    }

/**
 * Creates a read-only default preferences object with timestamps set to the last updated time of the default preferences.
 */
function createReadOnlyDefaultPreferences(): UserPreferences {
  return createDefaultPreferences(DEFAULT_PREFERENCES.lastUpdated)
}

/**
 * Runs migrations and normalizes shared preference metadata for a given preferences object.
 */
function migrateAndNormalizePreferences(
  preferences: UserPreferences,
): UserPreferences {
  const migratedPreferences = migratePreferences(preferences)
  const currentPreferences = {
    ...migratedPreferences,
  } as UserPreferences & {
    gatewayGuidance?: unknown
    productTour?: unknown
  }

  // Guidance progress has its own lifecycle and storage domain. Product Tour
  // never shipped in preferences, while released gateway data is migrated by
  // FeatureGuidanceStateService before these obsolete fields are removed.
  delete currentPreferences.gatewayGuidance
  delete currentPreferences.productTour

  return normalizeSharedPreferencesMetadata({
    ...currentPreferences,
    appearance: normalizeAppearance(currentPreferences.appearance),
    autoProvisionKeyOnAccountAddMode:
      currentPreferences.autoProvisionKeyOnAccountAddMode ===
      ACCOUNT_KEY_AUTO_PROVISION_MODES.AllGroups
        ? ACCOUNT_KEY_AUTO_PROVISION_MODES.AllGroups
        : ACCOUNT_KEY_AUTO_PROVISION_MODES.Default,
    tempWindowFallback: normalizeTempWindowFallbackPreferences(
      currentPreferences.tempWindowFallback,
    ),
  })
}

/**
 * Stamps the given preferences object with updated timestamps and preferences version.
 */
function stampPreferencesMetadata(
  preferences: UserPreferences,
  input: {
    lastUpdated: number
    sharedPreferencesLastUpdated: number
  },
): UserPreferences {
  return {
    ...preferences,
    lastUpdated: input.lastUpdated,
    sharedPreferencesLastUpdated: input.sharedPreferencesLastUpdated,
    preferencesVersion: CURRENT_PREFERENCES_VERSION,
  }
}

/** Owns every preference read/write transaction, restore and conflict rule. */
export class PreferencesStore {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
  }

  private async withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    // A preference write normalizes away obsolete fields, so move released
    // gateway progress first even when no UI guidance provider has mounted.
    await featureGuidanceState.ensureLegacyPreferenceMigration()
    return withExtensionStorageWriteLock(STORAGE_LOCKS.USER_PREFERENCES, work)
  }

  private async readRawPreferences(): Promise<UserPreferences | undefined> {
    return (await this.storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as UserPreferences | undefined
  }

  private createPreferencesSnapshot(
    storedPreferences: UserPreferences | undefined,
  ): UserPreferences {
    const defaultPreferences = createReadOnlyDefaultPreferences()
    if (!storedPreferences) return defaultPreferences

    return deepOverride(
      defaultPreferences,
      migrateAndNormalizePreferences(storedPreferences),
    )
  }

  /**
   * Reads and normalizes a preference snapshot without mutating storage.
   */
  private async readPreferencesSnapshot(): Promise<UserPreferences> {
    return this.createPreferencesSnapshot(await this.readRawPreferences())
  }

  /**
   * Get user preferences (with migration + defaults merged) without mutating storage.
   */
  async getPreferences(): Promise<UserPreferences> {
    try {
      return await this.readPreferencesSnapshot()
    } catch (error) {
      logger.error("获取用户偏好设置失败", error)
      return createReadOnlyDefaultPreferences()
    }
  }

  /**
   * Get current preferences while preserving storage failures for callers that
   * must fail closed instead of silently applying defaults.
   */
  async getPreferencesStrict(): Promise<UserPreferences> {
    return await this.readPreferencesSnapshot()
  }

  /**
   * Save partial user preferences (deep merge) and return a typed write result.
   */
  async savePreferencesWithResult(
    preferences: DeepPartial<UserPreferences>,
    options?: {
      expectedLastUpdated?: number
    },
  ): Promise<PreferenceWriteResult> {
    try {
      const writeResult = await this.withStorageWriteLock(async () => {
        const currentPreferences = await this.readPreferencesSnapshot()
        if (
          typeof options?.expectedLastUpdated === "number" &&
          Number.isFinite(options.expectedLastUpdated) &&
          currentPreferences.lastUpdated !== options.expectedLastUpdated
        ) {
          return {
            ok: false,
            reason: {
              type: PREFERENCE_WRITE_FAILURE_TYPES.Stale,
              expectedLastUpdated: options.expectedLastUpdated,
              actualLastUpdated: currentPreferences.lastUpdated,
            },
          } satisfies PreferenceWriteResult
        }

        const timestamp = Date.now()
        const sharedPreferencesLastUpdated = patchTouchesSharedPreferences(
          preferences,
        )
          ? timestamp
          : getSharedPreferencesLastUpdated(currentPreferences)

        const nextPreferences = stampPreferencesMetadata(
          deepOverride(currentPreferences, preferences),
          {
            lastUpdated: timestamp,
            sharedPreferencesLastUpdated,
          },
        )

        await this.storage.set(
          USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
          nextPreferences,
        )

        return {
          ok: true,
          preferences: nextPreferences,
        } satisfies PreferenceWriteResult
      })

      if (!writeResult.ok && writeResult.reason.type === "stale") {
        logger.debug("跳过过期的偏好设置写入", {
          expectedLastUpdated: writeResult.reason.expectedLastUpdated,
          actualLastUpdated: writeResult.reason.actualLastUpdated,
        })
        return writeResult
      }

      if (writeResult.ok) {
        logger.debug("偏好设置保存成功", {
          lastUpdated: writeResult.preferences.lastUpdated,
          sharedPreferencesLastUpdated:
            writeResult.preferences.sharedPreferencesLastUpdated,
          preferencesVersion: writeResult.preferences.preferencesVersion,
        })
      }

      return writeResult
    } catch (error) {
      logger.error("保存偏好设置失败", error)
      return {
        ok: false,
        reason: {
          type: PREFERENCE_WRITE_FAILURE_TYPES.StorageError,
          error,
        },
      }
    }
  }

  /**
   * Save partial user preferences (deep merge) and stamp timestamps/version.
   */
  async savePreferences(
    preferences: DeepPartial<UserPreferences>,
    options?: {
      expectedLastUpdated?: number
    },
  ): Promise<PreferenceWriteResult> {
    return this.savePreferencesWithResult(preferences, options)
  }

  /**
   * Reset all preferences to defaults.
   */
  async resetToDefaults(): Promise<PreferenceWriteResult> {
    try {
      const nextPreferences = createDefaultPreferences()
      await this.withStorageWriteLock(async () => {
        await this.storage.set(
          USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
          nextPreferences,
        )
      })
      logger.info("已重置为默认设置")
      return {
        ok: true,
        preferences: nextPreferences,
      }
    } catch (error) {
      logger.error("重置设置失败", error)
      return {
        ok: false,
        reason: {
          type: PREFERENCE_WRITE_FAILURE_TYPES.StorageError,
          error,
        },
      }
    }
  }

  /**
   * Clear stored preferences (removes key).
   */
  async clearPreferences(): Promise<PreferenceWriteResult> {
    try {
      await this.withStorageWriteLock(async () => {
        await this.storage.remove(
          USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
        )
      })
      logger.info("偏好设置已清空")
      return {
        ok: true,
        preferences: createDefaultPreferences(),
      }
    } catch (error) {
      logger.error("清空偏好设置失败", error)
      return {
        ok: false,
        reason: {
          type: PREFERENCE_WRITE_FAILURE_TYPES.StorageError,
          error,
        },
      }
    }
  }

  /**
   * Export preferences (returns current with migrations applied).
   */
  async exportPreferences(): Promise<UserPreferences> {
    return this.getPreferences()
  }

  /**
   * Export preferences for a backup file without GitHub Gist credentials.
   *
   * Existing WebDAV exports historically contained the active WebDAV fields,
   * so keep that behavior for WebDAV users. Gist credentials and identifiers
   * are always local-only; when Gist is active, the WebDAV fields are also
   * blanked so a Gist backup cannot carry stale cloud credentials.
   */
  async exportPreferencesForBackup(): Promise<UserPreferences> {
    const preferences = await this.getPreferences()
    const isGistProvider =
      preferences.webdav.provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
    const sanitized = {
      ...structuredClone(preferences),
      webdav: {
        ...preferences.webdav,
        ...(isGistProvider
          ? {
              url: "",
              username: "",
              password: "",
              backupEncryptionPassword: "",
            }
          : {}),
        githubGist: {
          ...(preferences.webdav.githubGist ?? {}),
          token: "",
          gistId: "",
          gistUrl: "",
        },
      },
    }

    // Older installations may still expose the pre-nested WebDAV fields while
    // a migration is being completed. Never copy those legacy fields into a
    // new backup; the nested WebDAV object remains the compatibility shape.
    delete sanitized.webdavUrl
    delete sanitized.webdavUsername
    delete sanitized.webdavPassword

    return sanitized
  }

  /**
   * Import preferences (runs migration before saving).
   *
   * WebDAV import policy:
   * - Manual import is allowed to restore the full preference object.
   * - WebDAV-based restore/sync flows may opt-in to preserving the current
   *   device's WebDAV-local fields (`webdav` + `accountAutoRefresh`) so shared
   *   preference sync never overwrites device-local operational settings.
   */
  async importPreferences(
    preferences: UserPreferences,
    options?: {
      preserveWebdav?: boolean
    },
  ): Promise<PreferenceWriteResult> {
    try {
      const importedPreferences = await this.withStorageWriteLock(async () => {
        const migratedPreferences = migrateAndNormalizePreferences(preferences)

        const currentPreferences = options?.preserveWebdav
          ? await this.readPreferencesSnapshot()
          : null
        const importedAt = Date.now()

        const preferencesToStore =
          options?.preserveWebdav && currentPreferences
            ? restoreWebdavLocalOnlyPreferences(
                migratedPreferences,
                currentPreferences,
              )
            : migratedPreferences

        const importedSharedPreferencesLastUpdated =
          getSharedPreferencesLastUpdated(preferencesToStore)
        const sharedPreferencesLastUpdated = options?.preserveWebdav
          ? importedSharedPreferencesLastUpdated > 0
            ? importedSharedPreferencesLastUpdated
            : importedAt
          : importedAt

        const nextPreferences = stampPreferencesMetadata(preferencesToStore, {
          lastUpdated: importedAt,
          sharedPreferencesLastUpdated,
        })

        await this.storage.set(
          USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
          nextPreferences,
        )
        return nextPreferences
      })
      logger.info("偏好设置导入成功，已迁移至最新版本")
      return {
        ok: true,
        preferences: importedPreferences,
      }
    } catch (error) {
      logger.error("导入偏好设置失败", error)
      return {
        ok: false,
        reason: {
          type: PREFERENCE_WRITE_FAILURE_TYPES.StorageError,
          error,
        },
      }
    }
  }
}
