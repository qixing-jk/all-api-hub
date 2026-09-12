export const MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES = {
  CREATE_ONLY: "create-only",
  NO_DEDUPE_OR_SYNC: "no-dedupe-or-sync",
  NO_ROLLBACK: "no-rollback",
} as const

export type ManagedSiteChannelMigrationGeneralWarningCode =
  (typeof MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES)[keyof typeof MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES]

export const MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES = {
  DROPS_MODEL_MAPPING: "drops-model-mapping",
  DROPS_STATUS_CODE_MAPPING: "drops-status-code-mapping",
  DROPS_ADVANCED_SETTINGS: "drops-advanced-settings",
  DROPS_MULTI_KEY_STATE: "drops-multi-key-state",
  SPLITS_KEYS: "splits-keys",
  TARGET_REMAPS_CHANNEL_TYPE: "target-remaps-channel-type",
  TARGET_NORMALIZES_BASE_URL: "target-normalizes-base-url",
  TARGET_FORCES_DEFAULT_GROUP: "target-forces-default-group",
  TARGET_IGNORES_PRIORITY: "target-ignores-priority",
  TARGET_IGNORES_WEIGHT: "target-ignores-weight",
  TARGET_SIMPLIFIES_STATUS: "target-simplifies-status",
} as const

export type ManagedSiteChannelMigrationItemWarningCode =
  (typeof MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES)[keyof typeof MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES]

export const MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES = {
  SOURCE_KEY_MISSING: "source-key-missing",
  SOURCE_KEYS_CHANGED: "source-keys-changed",
  SOURCE_MULTI_KEY_UNSUPPORTED: "source-multi-key-unsupported",
  SOURCE_KEY_RESOLUTION_FAILED: "source-key-resolution-failed",
  SOURCE_KEY_EXPORT_RESTRICTED: "source-key-export-restricted",
  SOURCE_TYPE_UNSUPPORTED: "source-type-unsupported",
  TARGET_DRAFT_PREPARATION_FAILED: "target-draft-preparation-failed",
} as const

export type ManagedSiteChannelMigrationBlockedReasonCode =
  (typeof MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES)[keyof typeof MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES]
