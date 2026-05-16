import { describe, expect, it, vi } from "vitest"

import {
  buildAutoCheckinConfigSnapshotProperties,
  trackAutoCheckinConfigSnapshot,
} from "~/services/productAnalytics/autoCheckin"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_SETTING_IDS,
} from "~/services/productAnalytics/events"
import { AUTO_CHECKIN_SCHEDULE_MODE } from "~/types/autoCheckin"

const { trackProductAnalyticsEventMock } = vi.hoisted(() => ({
  trackProductAnalyticsEventMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/events", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/productAnalytics/events")
  >()),
  trackProductAnalyticsEvent: trackProductAnalyticsEventMock,
}))

describe("auto-checkin product analytics", () => {
  it("builds a bucketed config snapshot without raw schedule values", () => {
    const snapshot = buildAutoCheckinConfigSnapshotProperties(
      {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        notifyUiOnCompletion: true,
        windowStart: "08:15",
        windowEnd: "12:45",
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
        deterministicTime: "09:30",
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
      PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    )

    expect(snapshot).toEqual({
      setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      global_enabled: true,
      ui_pretrigger_enabled: false,
      notify_completion_enabled: true,
      retry_enabled: true,
      schedule_mode: "deterministic",
      retry_interval_bucket: "10_30m",
      retry_max_attempts_bucket: "2_3",
      window_length_bucket: "4_12h",
      deterministic_time_bucket: "morning",
    })
    expect(JSON.stringify(snapshot)).not.toContain("08:15")
    expect(JSON.stringify(snapshot)).not.toContain("12:45")
    expect(JSON.stringify(snapshot)).not.toContain("09:30")
  })

  it("tracks the config snapshot as a setting_changed event", () => {
    trackAutoCheckinConfigSnapshot(
      {
        globalEnabled: false,
        pretriggerDailyOnUiOpen: true,
        notifyUiOnCompletion: false,
        windowStart: "20:00",
        windowEnd: "01:00",
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.RANDOM,
        retryStrategy: {
          enabled: false,
          intervalMinutes: 5,
          maxAttemptsPerDay: 1,
        },
      },
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    )

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        global_enabled: false,
        retry_interval_bucket: "lt_10m",
        retry_max_attempts_bucket: "1",
        window_length_bucket: "4_12h",
        deterministic_time_bucket: "unset",
      }),
    )
  })

  it("treats malformed time strings as unset instead of truncating them", () => {
    const snapshot = buildAutoCheckinConfigSnapshotProperties(
      {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        notifyUiOnCompletion: true,
        windowStart: "08:30:59",
        windowEnd: "12:00",
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
        deterministicTime: "09:30:59",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 1,
        },
      },
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    )

    expect(snapshot.window_length_bucket).toBe("lt_1h")
    expect(snapshot.deterministic_time_bucket).toBe("unset")
  })

  it("buckets invalid time bounds and long retry settings without raw values", () => {
    const snapshot = buildAutoCheckinConfigSnapshotProperties(
      {
        globalEnabled: false,
        pretriggerDailyOnUiOpen: true,
        notifyUiOnCompletion: false,
        windowStart: "24:00",
        windowEnd: "12:30",
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
        deterministicTime: "18:45",
        retryStrategy: {
          enabled: true,
          intervalMinutes: 90,
          maxAttemptsPerDay: 5,
        },
      },
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    )

    expect(snapshot).toEqual(
      expect.objectContaining({
        retry_interval_bucket: "gt_60m",
        retry_max_attempts_bucket: "4_plus",
        window_length_bucket: "lt_1h",
        deterministic_time_bucket: "evening",
      }),
    )
    expect(JSON.stringify(snapshot)).not.toContain("18:45")
  })

  it("buckets short overnight windows and afternoon deterministic times", () => {
    const snapshot = buildAutoCheckinConfigSnapshotProperties(
      {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
        notifyUiOnCompletion: true,
        windowStart: "23:45",
        windowEnd: "00:15",
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
        deterministicTime: "13:30",
        retryStrategy: {
          enabled: true,
          intervalMinutes: 60,
          maxAttemptsPerDay: 2,
        },
      },
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    )

    expect(snapshot).toEqual(
      expect.objectContaining({
        retry_interval_bucket: "30_60m",
        retry_max_attempts_bucket: "2_3",
        window_length_bucket: "lt_1h",
        deterministic_time_bucket: "afternoon",
      }),
    )
  })
})
