import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import type {
  AutoCheckinAccountSnapshot,
  AutoCheckinPreferences,
} from "~/types/autoCheckin"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import type { ProductAnalyticsActionDiagnostics } from "./actions"
import {
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_SETTING_IDS,
  trackProductAnalyticsEvent,
  type ProductAnalyticsAutoCheckinRunKind,
  type ProductAnalyticsEntrypoint,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsFailureReason,
  type ProductAnalyticsFailureStage,
  type ProductAnalyticsModeId,
  type ProductAnalyticsRequestedAuthMode,
  type ProductAnalyticsSiteType,
  type ProductAnalyticsSourceKind,
} from "./events"

type AutoCheckinRunAnalyticsParams = {
  runKind: ProductAnalyticsAutoCheckinRunKind
  entrypoint: typeof PRODUCT_ANALYTICS_ENTRYPOINTS.Background
  snapshots: AutoCheckinAccountSnapshot[]
  retryEnabled: boolean
  retryPendingBefore: number
  retryAttempted: number
  retryRescued: number
  retryPendingAfter: number
  retryExhausted: number
}

type AutoCheckinAccountGroupAnalyticsParams = {
  runKind: ProductAnalyticsAutoCheckinRunKind
  entrypoint: typeof PRODUCT_ANALYTICS_ENTRYPOINTS.Background
  snapshots: AutoCheckinAccountSnapshot[]
  accountsById: Map<string, Pick<SiteAccount, "authType">>
}

type AutoCheckinDiagnosticsParams = {
  sourceKind: ProductAnalyticsSourceKind
  mode: ProductAnalyticsModeId
  summary: AutoCheckinRunSummaryLike
  siteType?: ProductAnalyticsSiteType
  requestedAuthMode?: ProductAnalyticsRequestedAuthMode
  backgroundExecution?: boolean
  retryAttempted?: boolean
  retryCount?: number
  tempContextUsed?: boolean
  incognitoContextUsed?: boolean
  failureCategory?: ProductAnalyticsErrorCategory
  failureStage?: ProductAnalyticsFailureStage
  failureReason?: ProductAnalyticsFailureReason
}

type AutoCheckinRunSummaryLike = {
  totalEligible?: number
  executed: number
  successCount: number
  failedCount: number
  skippedCount: number
  needsRetry?: boolean
}

type AutoCheckinAccountGroupAccumulator = {
  run_kind: ProductAnalyticsAutoCheckinRunKind
  entrypoint: typeof PRODUCT_ANALYTICS_ENTRYPOINTS.Background
  site_type?: AutoCheckinAccountSnapshot["siteType"]
  requested_auth_mode?: AuthTypeEnum
  skip_reason?: NonNullable<AutoCheckinAccountSnapshot["skipReason"]>
  total_accounts: number
  runnable_accounts: number
  success_count: number
  failed_count: number
  skipped_count: number
}

/** Checks whether a check-in status should count as successful analytics. */
function isSuccessfulCheckinStatus(status: unknown) {
  return (
    status === CHECKIN_RESULT_STATUS.SUCCESS ||
    status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED
  )
}

/** Checks whether an account snapshot was eligible for provider execution. */
function isRunnableSnapshot(snapshot: AutoCheckinAccountSnapshot) {
  return (
    snapshot.detectionEnabled &&
    snapshot.autoCheckinEnabled &&
    snapshot.providerAvailable &&
    !snapshot.skipReason
  )
}

/** Resolves the account auth mode used for group analytics. */
function getSnapshotAuthMode(
  snapshot: AutoCheckinAccountSnapshot,
  accountsById: Map<string, Pick<SiteAccount, "authType">>,
) {
  return accountsById.get(snapshot.accountId)?.authType ?? AuthTypeEnum.None
}

/** Builds the stable grouping key for site/auth/skip dimensions. */
function buildGroupKey(
  snapshot: AutoCheckinAccountSnapshot,
  authMode: AuthTypeEnum,
) {
  return [snapshot.siteType, authMode, snapshot.skipReason ?? ""].join("\u001f")
}

/** Adds one account snapshot to an aggregate analytics group. */
function incrementGroupCounts(
  group: AutoCheckinAccountGroupAccumulator,
  snapshot: AutoCheckinAccountSnapshot,
) {
  group.total_accounts += 1
  if (isRunnableSnapshot(snapshot)) {
    group.runnable_accounts += 1
  }

  const status = snapshot.lastResult?.status
  if (isSuccessfulCheckinStatus(status)) {
    group.success_count += 1
  } else if (status === CHECKIN_RESULT_STATUS.FAILED) {
    group.failed_count += 1
  } else if (status === CHECKIN_RESULT_STATUS.SKIPPED || snapshot.skipReason) {
    group.skipped_count += 1
  }
}

/**
 * Builds a raw-count Auto Check-in run summary without account identifiers.
 */
export function buildAutoCheckinRunSummaryProperties(
  params: AutoCheckinRunAnalyticsParams,
) {
  const snapshots = params.snapshots
  return {
    run_kind: params.runKind,
    entrypoint: params.entrypoint,
    total_accounts: snapshots.length,
    detection_enabled_accounts: snapshots.filter(
      (snapshot) => snapshot.detectionEnabled,
    ).length,
    auto_checkin_enabled_accounts: snapshots.filter(
      (snapshot) => snapshot.autoCheckinEnabled,
    ).length,
    provider_available_accounts: snapshots.filter(
      (snapshot) => snapshot.providerAvailable,
    ).length,
    runnable_accounts: snapshots.filter(isRunnableSnapshot).length,
    success_count: snapshots.filter((snapshot) =>
      isSuccessfulCheckinStatus(snapshot.lastResult?.status),
    ).length,
    failed_count: snapshots.filter(
      (snapshot) =>
        snapshot.lastResult?.status === CHECKIN_RESULT_STATUS.FAILED,
    ).length,
    skipped_count: snapshots.filter(
      (snapshot) =>
        snapshot.lastResult?.status === CHECKIN_RESULT_STATUS.SKIPPED ||
        snapshot.skipReason,
    ).length,
    retry_enabled: params.retryEnabled,
    retry_pending_before: params.retryPendingBefore,
    retry_attempted: params.retryAttempted,
    retry_rescued: params.retryRescued,
    retry_pending_after: params.retryPendingAfter,
    retry_exhausted: params.retryExhausted,
  } as const
}

/**
 * Builds low-cardinality Auto Check-in account group summaries.
 */
export function buildAutoCheckinAccountGroupProperties(
  params: AutoCheckinAccountGroupAnalyticsParams,
) {
  const groups = new Map<string, AutoCheckinAccountGroupAccumulator>()

  for (const snapshot of params.snapshots) {
    const authMode = getSnapshotAuthMode(snapshot, params.accountsById)
    const key = buildGroupKey(snapshot, authMode)
    const existing = groups.get(key)
    const group =
      existing ??
      ({
        run_kind: params.runKind,
        entrypoint: params.entrypoint,
        site_type: snapshot.siteType,
        requested_auth_mode: authMode,
        ...(snapshot.skipReason ? { skip_reason: snapshot.skipReason } : {}),
        total_accounts: 0,
        runnable_accounts: 0,
        success_count: 0,
        failed_count: 0,
        skipped_count: 0,
      } satisfies AutoCheckinAccountGroupAccumulator)

    incrementGroupCounts(group, snapshot)
    groups.set(key, group)
  }

  return Array.from(groups.values())
}

/**
 * Builds structured action diagnostics from already-aggregated Auto Check-in data.
 */
export function buildAutoCheckinDiagnostics({
  sourceKind,
  mode,
  summary,
  siteType,
  requestedAuthMode,
  backgroundExecution,
  retryAttempted,
  retryCount,
  tempContextUsed,
  incognitoContextUsed,
  failureCategory,
  failureStage,
  failureReason,
}: AutoCheckinDiagnosticsParams): ProductAnalyticsActionDiagnostics {
  const failed = summary.failedCount > 0

  return {
    context: {
      sourceKind,
      mode,
      ...(siteType ? { siteType } : {}),
      ...(requestedAuthMode ? { requestedAuthMode } : {}),
    },
    ...(typeof backgroundExecution === "boolean" ||
    typeof retryAttempted === "boolean" ||
    typeof retryCount === "number" ||
    typeof tempContextUsed === "boolean" ||
    typeof incognitoContextUsed === "boolean"
      ? {
          execution: {
            ...(typeof backgroundExecution === "boolean"
              ? { backgroundExecution }
              : {}),
            ...(typeof retryAttempted === "boolean" ? { retryAttempted } : {}),
            ...(typeof retryCount === "number" ? { retryCount } : {}),
            ...(typeof tempContextUsed === "boolean"
              ? { tempContextUsed }
              : {}),
            ...(typeof incognitoContextUsed === "boolean"
              ? { incognitoContextUsed }
              : {}),
          },
        }
      : {}),
    outcome: {
      itemCount:
        summary.totalEligible ?? summary.executed + summary.skippedCount,
      successCount: summary.successCount,
      failureCount: summary.failedCount,
      skippedCount: summary.skippedCount,
    },
    ...(failed
      ? {
          failure: {
            category:
              failureCategory ?? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            stage: failureStage ?? PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
            reason: failureReason ?? PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
          },
        }
      : {}),
  }
}

/**
 * Emits Auto Check-in run and group summaries as best-effort analytics events.
 */
export function trackAutoCheckinRunAnalytics(
  params: AutoCheckinRunAnalyticsParams & {
    accountsById: Map<string, Pick<SiteAccount, "authType">>
  },
) {
  void trackProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.AutoCheckinRunSummaryCaptured,
    buildAutoCheckinRunSummaryProperties(params),
  )

  for (const group of buildAutoCheckinAccountGroupProperties(params)) {
    void trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.AutoCheckinAccountGroupCaptured,
      group,
    )
  }
}

/**
 * Parses a local HH:mm value so analytics can report exact local-minute offsets without raw strings.
 */
function parseTimeToMinutes(time: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return null
  }

  const [hour, minute] = time.split(":").map(Number)
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null
  }

  return hour * 60 + minute
}

/**
 * Normalizes retry interval minutes into a non-negative analytics value.
 */
function normalizeNonNegativeInteger(value: number | undefined) {
  const numberValue = Number(value)
  if (
    !Number.isFinite(numberValue) ||
    !Number.isInteger(numberValue) ||
    numberValue < 0
  ) {
    return 0
  }
  return numberValue
}

/**
 * Normalizes retry interval minutes into a non-negative analytics value.
 */
function normalizeRetryInterval(intervalMinutes: number | undefined) {
  const interval = Number(intervalMinutes)
  return Number.isFinite(interval) && interval >= 0 ? Math.round(interval) : 0
}

/**
 * Normalizes retry attempt limits into a non-negative analytics value.
 */
function normalizeRetryAttempts(maxAttempts: number | undefined) {
  return normalizeNonNegativeInteger(maxAttempts)
}

/**
 * Converts the configured daily check-in window length into minutes.
 */
function getWindowLengthMinutes(config: AutoCheckinPreferences) {
  const start = parseTimeToMinutes(config.windowStart)
  const end = parseTimeToMinutes(config.windowEnd)

  if (start === null || end === null || start === end) {
    return 0
  }

  return end > start ? end - start : 24 * 60 - start + end
}

/**
 * Converts deterministic run time into minutes from local midnight.
 */
function getDeterministicTimeMinutes(time: string | undefined) {
  if (!time) {
    return undefined
  }

  const minutes = parseTimeToMinutes(time)
  if (minutes === null) {
    return undefined
  }
  return minutes
}

/**
 * Builds a sanitized Auto Check-in strategy snapshot for PostHog.
 */
export function buildAutoCheckinConfigSnapshotProperties(
  preferences: AutoCheckinPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
) {
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
    entrypoint,
    global_enabled: preferences.globalEnabled === true,
    ui_pretrigger_enabled: preferences.pretriggerDailyOnUiOpen === true,
    notify_completion_enabled: preferences.notifyUiOnCompletion !== false,
    retry_enabled: preferences.retryStrategy?.enabled === true,
    schedule_mode:
      preferences.scheduleMode === AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC
        ? PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES.Deterministic
        : PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES.Random,
    retry_interval_minutes: normalizeRetryInterval(
      preferences.retryStrategy?.intervalMinutes,
    ),
    retry_max_attempts: normalizeRetryAttempts(
      preferences.retryStrategy?.maxAttemptsPerDay,
    ),
    window_length_minutes: getWindowLengthMinutes(preferences),
    ...(preferences.scheduleMode === AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC
      ? {
          deterministic_time_minutes: getDeterministicTimeMinutes(
            preferences.deterministicTime,
          ),
        }
      : {}),
  } as const
}

/**
 * Emits the privacy-filtered Auto Check-in strategy snapshot.
 */
export function trackAutoCheckinConfigSnapshot(
  preferences: AutoCheckinPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
) {
  void trackProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
    buildAutoCheckinConfigSnapshotProperties(preferences, entrypoint),
  )
}
