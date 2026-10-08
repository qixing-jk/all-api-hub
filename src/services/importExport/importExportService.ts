import { BACKUP_VERSION } from "~/constants/importExport"
import {
  getSupportedBackupVersion,
  LEGACY_BACKUP_V1_VERSION,
  LEGACY_BACKUP_V2_VERSION,
  LEGACY_BACKUP_V3_VERSION,
  readChannelConfigSnapshot,
} from "~/services/importExport/backupCodec"
import {
  IMPORT_EXPORT_ERROR_CODES,
  IMPORT_SECTION_STRATEGIES,
  ImportExportError,
  type BackupV2,
  type ImportFromBackupOptions,
  type ImportResult,
  type RawBackupData,
} from "~/services/importExport/backupContracts"
import { importV2Backup } from "~/services/importExport/canonicalImport"
import { importV1Backup } from "~/services/importExport/legacyImport"
import { ensureLegacyChannelConfigMigrationReady } from "~/services/managedSites/legacyChannelConfigMigration"

/**
 * Import a backup object into local storage in a version-aware way.
 *
 * Dispatches to specific handlers per version:
 * - V1 (or missing version): tolerant of legacy shapes and tries to import
 *   accounts, preferences and channelConfigs when present.
 * - V2: imports flat account/preference sections and ignores numeric channel configs.
 * - V3: imports the same flat sections plus scoped channel configs.
 * - V4 (BACKUP_VERSION): keeps V3's envelope and writes canonical V7 accounts.
 * - Future or otherwise unknown explicit versions are rejected so their data is
 *   not interpreted through an older schema.
 */
export async function importFromBackupObject(
  data: RawBackupData,
  options?: ImportFromBackupOptions,
): Promise<ImportResult> {
  // timestamp is required for all versions; version is optional for backward compatibility
  if (!data.timestamp) {
    throw new ImportExportError(IMPORT_EXPORT_ERROR_CODES.FormatNotCorrect)
  }

  const version = getSupportedBackupVersion(data)

  const incomingChannelConfigs = readChannelConfigSnapshot(data)
  const channelConfigStrategy =
    options?.plan?.channelConfigs ??
    (options?.mode === IMPORT_SECTION_STRATEGIES.Merge
      ? IMPORT_SECTION_STRATEGIES.Merge
      : IMPORT_SECTION_STRATEGIES.Replace)
  if (
    incomingChannelConfigs !== null &&
    channelConfigStrategy === IMPORT_SECTION_STRATEGIES.Merge
  ) {
    await ensureLegacyChannelConfigMigrationReady({ bypassBackoff: true })
  }

  if (version === LEGACY_BACKUP_V1_VERSION) {
    return importV1Backup(data, options)
  }

  if (
    version === BACKUP_VERSION ||
    version === LEGACY_BACKUP_V3_VERSION ||
    version === LEGACY_BACKUP_V2_VERSION
  ) {
    return importV2Backup(data as BackupV2, options)
  }

  // Compile-time exhaustiveness plus a defensive runtime guard for untyped data.
  const exhaustiveVersion: never = version
  throw new ImportExportError(exhaustiveVersion)
}
