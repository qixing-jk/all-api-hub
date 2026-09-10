import {
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES,
  type ManagedSiteChannelMigrationItemWarningCode,
} from "~/types/managedSiteMigration"
import type {
  ManagedSiteMigrationLossSignals,
  ManagedSiteMigrationTargetAdjustments,
} from "~/types/managedSiteMigrationCapability"

/** Maps provider-owned loss and adjustment facts to ordered product warnings. */
export function toMigrationWarningCodes({
  lossSignals,
  adjustments,
}: {
  lossSignals: ManagedSiteMigrationLossSignals
  adjustments: ManagedSiteMigrationTargetAdjustments
}): ManagedSiteChannelMigrationItemWarningCode[] {
  const warnings: ManagedSiteChannelMigrationItemWarningCode[] = []
  if (lossSignals.hasModelMapping) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MODEL_MAPPING,
    )
  }
  if (lossSignals.hasStatusCodeMapping) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_STATUS_CODE_MAPPING,
    )
  }
  if (lossSignals.hasAdvancedSettings) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_ADVANCED_SETTINGS,
    )
  }
  if (lossSignals.hasMultiKeyState) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MULTI_KEY_STATE,
    )
  }
  if (adjustments.remappedType) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
    )
  }
  if (adjustments.normalizedBaseUrl) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_NORMALIZES_BASE_URL,
    )
  }
  if (adjustments.forcedDefaultGroup) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
    )
  }
  if (adjustments.ignoredPriority) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_PRIORITY,
    )
  }
  if (adjustments.ignoredWeight) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_WEIGHT,
    )
  }
  if (adjustments.simplifiedStatus) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
    )
  }

  return warnings
}
