/**
 * Persisted backup and synchronization contracts. Protocol splits add a new
 * ID instead of renaming an existing value.
 */
export const AUTO_CHECKIN_METHOD_IDS = {
  NewApiDailyCheckIn: "new-api:daily-checkin",
  VeloeraDailyCheckIn: "veloera:daily-checkin",
  WongGongyiDailyCheckIn: "wong-gongyi:daily-checkin",
  AnyrouterDailyCheckIn: "anyrouter:daily-checkin",
  VoApiV2DailyCheckIn: "voapi-v2:daily-checkin",
} as const

export const CHECK_IN_METHOD_UNKNOWN_REASON_CODES = {
  Network: "network",
  Timeout: "timeout",
  AuthenticationRequired: "authentication_required",
  PermissionDenied: "permission_denied",
  SourceUnavailable: "source_unavailable",
  IdentityMismatch: "identity_mismatch",
  InvalidResponse: "invalid_response",
  CredentialPersistenceFailed: "credential_persistence_failed",
} as const

export const CHECK_IN_METHOD_UNKNOWN_REASONS = [
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Network,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Timeout,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.AuthenticationRequired,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.PermissionDenied,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.SourceUnavailable,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.IdentityMismatch,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.CredentialPersistenceFailed,
] as const

export const CHECK_IN_PROVIDER_READINESS_REASONS = {
  AccountDataMissing: "account_data_missing",
  CredentialsMissing: "credentials_missing",
} as const

export const CHECK_IN_METHOD_DETECTION_OUTCOMES = {
  Matched: "matched",
  Unsupported: "unsupported",
  Unknown: "unknown",
} as const

export const CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES = {
  Probe: "probe",
  LegacyMigration: "legacy_migration",
  CompatibilityRegistration: "compatibility_registration",
} as const

export const CHECK_IN_METHOD_STATUS_OUTCOMES = {
  Known: "known",
  Unknown: "unknown",
} as const

export const CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES = {
  Probe: "probe",
  Execution: "execution",
  LegacyMigration: "legacy_migration",
} as const

export const CHECK_IN_METHOD_AVAILABILITIES = {
  Enabled: "enabled",
  Disabled: "disabled",
} as const

export const CHECK_IN_METHOD_TODAY_STATUSES = {
  Checked: "checked",
  NotChecked: "not_checked",
} as const

export const CHECK_IN_SELECTION_MODES = {
  Automatic: "automatic",
  Manual: "manual",
} as const

export const CHECK_IN_DISCOVERY_DECISION_OUTCOMES = {
  Resolved: "resolved",
  Ambiguous: "ambiguous",
  Unknown: "unknown",
  Unsupported: "unsupported",
} as const

export const CHECK_IN_SELECTION_STATUSES = {
  None: "none",
  Selected: "selected",
  Stale: "stale",
} as const

export const CHECK_IN_SELECTION_STALE_REASONS = {
  MethodUnavailable: "method_unavailable",
  MethodNotMatched: "method_not_matched",
  MethodUnsupported: "method_unsupported",
} as const

export const CHECK_IN_EXECUTION_SKIP_REASONS = {
  AccountDisabled: "account_disabled",
  GlobalAutomaticExecutionDisabled: "global_automatic_execution_disabled",
  AutomaticExecutionDisabled: "automatic_execution_disabled",
  NoSelectedMethod: "no_selected_method",
  MethodUnavailable: CHECK_IN_SELECTION_STALE_REASONS.MethodUnavailable,
  MethodNotMatched: CHECK_IN_SELECTION_STALE_REASONS.MethodNotMatched,
  MethodUnsupported: CHECK_IN_SELECTION_STALE_REASONS.MethodUnsupported,
  MethodDisabled: "method_disabled",
  AlreadyChecked: "already_checked",
  StatusUnavailable: "status_unavailable",
  NoProvider: "no_provider",
  AccountDataMissing: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
  AuthenticationRequired: "authentication_required",
  CredentialsMissing: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
  NetworkError: "network_error",
  SourceUnavailable: "source_unavailable",
  PermissionDenied: "permission_denied",
  Timeout: "timeout",
  AccountUnavailable: "account_unavailable",
} as const

export const CHECK_IN_METHOD_EXECUTION_RESULT_KINDS = {
  Executed: "executed",
  Skipped: "skipped",
} as const
