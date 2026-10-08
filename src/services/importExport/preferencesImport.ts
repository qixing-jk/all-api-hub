import { featureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"
import { readBackupFeatureGuidance } from "~/services/importExport/backupCodec"
import {
  type BackupFullV2,
  type BackupPreferencesPartialV2,
  type BackupV2,
  type ImportFromBackupOptions,
  type RawBackupData,
} from "~/services/importExport/backupContracts"
import { userPreferences } from "~/services/preferences/userPreferences"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to import/export helpers for backups and preferences.
 */
const logger = createLogger("ImportExportService")

/** Merges guidance carried by the preferences backup section into local state. */
export async function importBackupFeatureGuidance(
  data: RawBackupData,
): Promise<void> {
  const incoming = readBackupFeatureGuidance(data)
  if (incoming) {
    await featureGuidanceState.mergeState(incoming)
  }
}

/** Imports V2 preferences by replacing current user preferences. */
export async function importV2Preferences(
  data: BackupV2,
  options?: ImportFromBackupOptions,
) {
  const { preferences } = data as BackupFullV2 | BackupPreferencesPartialV2
  const writeResult = options?.preserveWebdav
    ? await userPreferences.importPreferences(preferences, {
        preserveWebdav: true,
      })
    : await userPreferences.importPreferences(preferences)

  if (!writeResult.ok) {
    logger.error("Failed to import user preferences from V2 backup")
    return false
  }

  await importBackupFeatureGuidance(data)
  return true
}
