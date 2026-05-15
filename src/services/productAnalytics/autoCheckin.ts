import type { AutoCheckinPreferences } from "~/types/autoCheckin"
import { AUTO_CHECKIN_SCHEDULE_MODE } from "~/types/autoCheckin"

import {
  PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_INTERVAL_BUCKETS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  trackProductAnalyticsEvent,
  type ProductAnalyticsEntrypoint,
} from "./events"

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
    PRODUCT_ANALYTICS_EVENTS.SettingChanged,
    buildAutoCheckinConfigSnapshotProperties(preferences, entrypoint),
  )
}
