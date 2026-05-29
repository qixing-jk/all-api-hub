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

import {
  PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_INTERVAL_BUCKETS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  trackProductAnalyticsEvent,
  type ProductAnalyticsAutoCheckinRunKind,
  type ProductAnalyticsEntrypoint,
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
 * Parses a local HH:mm value so analytics can bucket time without exposing it.
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
 * Converts retry interval minutes into a coarse strategy bucket.
 */
function bucketRetryInterval(intervalMinutes: number | undefined) {
  const interval = Number(intervalMinutes)
  if (!Number.isFinite(interval) || interval < 10) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_INTERVAL_BUCKETS.LessThan10m
  }
  if (interval <= 30) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_INTERVAL_BUCKETS.TenTo30m
  }
  if (interval <= 60) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_INTERVAL_BUCKETS.ThirtyTo60m
  }
  return PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_INTERVAL_BUCKETS.GreaterThan60m
}

/**
 * Converts retry attempt limits into a coarse strategy bucket.
 */
function bucketRetryAttempts(maxAttempts: number | undefined) {
  const attempts = Number(maxAttempts)
  if (!Number.isFinite(attempts) || attempts <= 1) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS.One
  }
  if (attempts <= 3) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS.TwoToThree
  }
  return PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS.FourPlus
}

/**
 * Buckets the configured daily check-in window length without exposing bounds.
 */
function bucketWindowLength(config: AutoCheckinPreferences) {
  const start = parseTimeToMinutes(config.windowStart)
  const end = parseTimeToMinutes(config.windowEnd)

  if (start === null || end === null || start === end) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS.LessThan1h
  }

  const durationMinutes = end > start ? end - start : 24 * 60 - start + end
  if (durationMinutes < 60) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS.LessThan1h
  }
  if (durationMinutes <= 4 * 60) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS.OneTo4h
  }
  if (durationMinutes <= 12 * 60) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS.FourTo12h
  }
  return PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS.GreaterThan12h
}

/**
 * Buckets deterministic run time into a broad day-part value.
 */
function bucketDeterministicTime(time: string | undefined) {
  if (!time) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS.Unset
  }

  const minutes = parseTimeToMinutes(time)
  if (minutes === null) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS.Unset
  }

  const hour = Math.floor(minutes / 60)
  if (hour < 6) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS.Night
  }
  if (hour < 12) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS.Morning
  }
  if (hour < 18) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS.Afternoon
  }
  return PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS.Evening
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
    retry_interval_bucket: bucketRetryInterval(
      preferences.retryStrategy?.intervalMinutes,
    ),
    retry_max_attempts_bucket: bucketRetryAttempts(
      preferences.retryStrategy?.maxAttemptsPerDay,
    ),
    window_length_bucket: bucketWindowLength(preferences),
    deterministic_time_bucket: bucketDeterministicTime(
      preferences.scheduleMode === AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC
        ? preferences.deterministicTime
        : undefined,
    ),
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
