// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { autoCheckinAlarmSchedule } from "~/services/checkin/autoCheckin/scheduling/alarmSchedule"
import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import {
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_SETTING_IDS,
} from "~/services/productAnalytics/contracts"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import {
  mockedBrowserApi,
  mockedProductAnalytics,
  mockedUserPreferences,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("autoCheckinScheduler.scheduleNextRun", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })

  it("does not emit a settings snapshot on every schedule refresh", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    await expect(
      autoCheckinScheduler.scheduleNextRun(),
    ).resolves.toBeUndefined()

    // `scheduleNextRun` runs on every MV3 service-worker start, so a per-call
    // event turns into a heartbeat. Every field it used to report is already
    // carried by the cadence-limited aggregate background settings snapshot.
    const backgroundConfigSnapshots =
      mockedProductAnalytics.trackProductAnalyticsEvent.mock.calls.filter(
        ([eventName, payload]) =>
          eventName === PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured &&
          payload?.setting_id ===
            PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
      )
    expect(backgroundConfigSnapshots).toEqual([])

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckin")
    expect(schedulerTestState.alarmStore.autoCheckinDaily).toBeDefined()

    vi.useRealTimers()
  })

  it("returns without touching alarms when the alarms API is unavailable", async () => {
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(false)

    await autoCheckinScheduler.scheduleNextRun()

    expect(mockedBrowserApi.clearAlarm).not.toHaveBeenCalled()
    expect(mockedBrowserApi.createAlarm).not.toHaveBeenCalled()
    expect(schedulerTestState.statusWriteCount).toBe(0)
  })

  it("should clear daily/retry alarms and clear schedules when globalEnabled is false", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: false,
      },
    })
    schedulerTestState.storedStatus = {
      lastRunResult: "success",
      lastRunAt: "2024-01-01T00:00:00.000Z",
      perAccount: {},
      nextDailyScheduledAt: "2024-01-02T00:00:00.000Z",
      nextRetryScheduledAt: "2024-01-01T00:10:00.000Z",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
    } as any

    await (autoCheckinScheduler as any).scheduleNextRun()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckin")
    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinDaily")
    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinRetry")
    expect(schedulerTestState.storedStatus.nextDailyScheduledAt).toBeUndefined()
    expect(schedulerTestState.storedStatus.nextRetryScheduledAt).toBeUndefined()
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
  })

  it("keeps persisted results when the disabled global switch clears schedules", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: false,
      },
    })
    schedulerTestState.storedStatus = {
      lastRunAt: "2024-01-01T09:00:00.000Z",
      lastRunResult: "failed",
      perAccount: { a: { accountId: "a", status: "error" } },
      nextDailyScheduledAt: "2024-01-02T00:00:00.000Z",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
      pendingRetry: true,
    }

    await (autoCheckinScheduler as any).scheduleNextRun()

    // Only the schedule bookkeeping is cleared; the run results stay.
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("failed")
    expect(schedulerTestState.storedStatus.perAccount).toEqual({
      a: { accountId: "a", status: "error" },
    })
    expect(schedulerTestState.storedStatus.nextDailyScheduledAt).toBeUndefined()
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
  })

  it("does not create status when the disabled global switch has nothing to clear", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: false,
      },
    })
    schedulerTestState.storedStatus = null

    await autoCheckinScheduler.scheduleNextRun()

    expect(schedulerTestState.storedStatus).toBeNull()
    expect(schedulerTestState.statusWriteCount).toBe(0)
  })

  it("schedules the daily alarm for the next day when it already ran today (random mode)", async () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)
    vi.setSystemTime(new Date(2024, 0, 1, 9, 5, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        globalEnabled: true,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    schedulerTestState.storedStatus = { lastDailyRunDay: "2024-01-01" }

    await autoCheckinScheduler.scheduleNextRun()

    const expected = new Date(2024, 0, 2, 8, 0, 0, 0)
    expect(schedulerTestState.alarmStore.autoCheckinDaily.scheduledTime).toBe(
      expected.getTime(),
    )
    expect(schedulerTestState.storedStatus.nextDailyScheduledAt).toBe(
      expected.toISOString(),
    )
    expect(schedulerTestState.storedStatus.nextScheduledAt).toBe(
      expected.toISOString(),
    )

    randomSpy.mockRestore()
    vi.useRealTimers()
  })

  it("schedules tomorrow's deterministic time when startup restore misses the fixed time outside the window", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 10, 0, 0)
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "08:00",
        windowEnd: "09:00",
        scheduleMode: "deterministic",
        deterministicTime: "08:30",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const expectedTime = new Date(2024, 0, 2, 8, 30, 0, 0)
    const expectedTargetDay = formatLocalDayKey(expectedTime)

    await autoCheckinScheduler.scheduleNextRun({
      preserveExisting: true,
      allowCatchUp: true,
    })

    expect(schedulerTestState.alarmStore.autoCheckinDaily.scheduledTime).toBe(
      expectedTime.getTime(),
    )
    expect(schedulerTestState.storedStatus.nextDailyScheduledAt).toBe(
      expectedTime.toISOString(),
    )
    expect(schedulerTestState.storedStatus.dailyAlarmTargetDay).toBe(
      expectedTargetDay,
    )
    expect(schedulerTestState.storedStatus.nextScheduledAt).toBe(
      expectedTime.toISOString(),
    )

    vi.useRealTimers()
  })

  it("schedules tomorrow's deterministic time when today's daily run already executed", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 10, 0, 0)
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "08:00",
        windowEnd: "09:00",
        scheduleMode: "deterministic",
        deterministicTime: "08:30",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const today = formatLocalDayKey(now)
    const expectedTime = new Date(2024, 0, 2, 8, 30, 0, 0)
    const expectedTargetDay = formatLocalDayKey(expectedTime)
    schedulerTestState.storedStatus = { lastDailyRunDay: today }

    await autoCheckinScheduler.scheduleNextRun()

    expect(schedulerTestState.alarmStore.autoCheckinDaily.scheduledTime).toBe(
      expectedTime.getTime(),
    )
    expect(schedulerTestState.storedStatus.nextDailyScheduledAt).toBe(
      expectedTime.toISOString(),
    )
    expect(schedulerTestState.storedStatus.dailyAlarmTargetDay).toBe(
      expectedTargetDay,
    )
    expect(schedulerTestState.storedStatus.nextScheduledAt).toBe(
      expectedTime.toISOString(),
    )

    vi.useRealTimers()
  })

  it("recreates a preserved same-day alarm when startup restore needs an earlier deterministic catch-up", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 10, 0, 0)
    const catchUpDelayMs = 60_000
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "08:00",
        windowEnd: "12:00",
        scheduleMode: "deterministic",
        deterministicTime: "08:30",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const today = formatLocalDayKey(now)
    const staleTime = new Date(2024, 0, 1, 11, 30, 0, 0)
    const expectedTime = new Date(now.getTime() + catchUpDelayMs)
    schedulerTestState.alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: staleTime.getTime(),
    }
    schedulerTestState.storedStatus = {
      nextDailyScheduledAt: staleTime.toISOString(),
      dailyAlarmTargetDay: formatLocalDayKey(staleTime),
      nextScheduledAt: staleTime.toISOString(),
    }

    await autoCheckinScheduler.scheduleNextRun({
      preserveExisting: true,
      allowCatchUp: true,
    })

    expect(schedulerTestState.alarmStore.autoCheckinDaily.scheduledTime).toBe(
      expectedTime.getTime(),
    )
    expect(schedulerTestState.storedStatus.nextDailyScheduledAt).toBe(
      expectedTime.toISOString(),
    )
    expect(schedulerTestState.storedStatus.dailyAlarmTargetDay).toBe(today)
    expect(schedulerTestState.storedStatus.nextScheduledAt).toBe(
      expectedTime.toISOString(),
    )
    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinDaily")

    vi.useRealTimers()
  })

  it("reuses a preserved same-day alarm when deterministic catch-up would only postpone it", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 10, 0, 0)
    const preservedTime = new Date(now.getTime() + 30_000)
    const staleTime = new Date(2024, 0, 1, 11, 30, 0, 0)
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "08:00",
        windowEnd: "12:00",
        scheduleMode: "deterministic",
        deterministicTime: "08:30",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const expectedTargetDay = formatLocalDayKey(preservedTime)
    schedulerTestState.alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: preservedTime.getTime(),
    }
    schedulerTestState.storedStatus = {
      nextDailyScheduledAt: staleTime.toISOString(),
      dailyAlarmTargetDay: formatLocalDayKey(staleTime),
      nextScheduledAt: staleTime.toISOString(),
    }

    await autoCheckinScheduler.scheduleNextRun({
      preserveExisting: true,
      allowCatchUp: true,
    })

    expect(schedulerTestState.alarmStore.autoCheckinDaily.scheduledTime).toBe(
      preservedTime.getTime(),
    )
    expect(schedulerTestState.storedStatus.nextDailyScheduledAt).toBe(
      preservedTime.toISOString(),
    )
    expect(schedulerTestState.storedStatus.dailyAlarmTargetDay).toBe(
      expectedTargetDay,
    )
    expect(schedulerTestState.storedStatus.nextScheduledAt).toBe(
      preservedTime.toISOString(),
    )
    expect(mockedBrowserApi.clearAlarm).not.toHaveBeenCalledWith(
      "autoCheckinDaily",
    )

    vi.useRealTimers()
  })

  it("merges daily schedule updates into the latest status snapshot", async () => {
    const freshStatus = {
      lastRunAt: "2024-01-02T00:00:00.000Z",
      lastRunResult: "failed",
      nextRetryScheduledAt: "2024-01-02T00:10:00.000Z",
      pendingRetry: true,
    }
    const scheduledTime = new Date("2024-01-03T08:30:00.000Z")
    const targetDay = formatLocalDayKey(scheduledTime)

    schedulerTestState.storedStatus = freshStatus

    await (autoCheckinAlarmSchedule as any).syncDailyScheduleStatus(
      scheduledTime,
      targetDay,
    )

    expect(schedulerTestState.storedStatus.lastRunAt).toBe(
      freshStatus.lastRunAt,
    )
    expect(schedulerTestState.storedStatus.nextRetryScheduledAt).toBe(
      freshStatus.nextRetryScheduledAt,
    )
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(true)
    expect(schedulerTestState.storedStatus.nextDailyScheduledAt).toBe(
      scheduledTime.toISOString(),
    )
    expect(schedulerTestState.storedStatus.dailyAlarmTargetDay).toBe(targetDay)
    expect(schedulerTestState.storedStatus.nextScheduledAt).toBe(
      scheduledTime.toISOString(),
    )
  })

  it("does not rewrite an already synchronized daily schedule", async () => {
    const scheduledTime = new Date("2024-01-03T08:30:00.000Z")
    const targetDay = formatLocalDayKey(scheduledTime)
    schedulerTestState.storedStatus = {
      nextDailyScheduledAt: scheduledTime.toISOString(),
      dailyAlarmTargetDay: targetDay,
      nextScheduledAt: scheduledTime.toISOString(),
    }

    await (autoCheckinAlarmSchedule as any).syncDailyScheduleStatus(
      scheduledTime,
      targetDay,
    )

    expect(schedulerTestState.statusWriteCount).toBe(0)
  })

  it("clears stored daily metadata when the schedule configuration is invalid", async () => {
    schedulerTestState.storedStatus = {
      lastRunResult: "success",
      nextDailyScheduledAt: "2024-01-03T08:30:00.000Z",
      dailyAlarmTargetDay: "2024-01-03",
      nextScheduledAt: "2024-01-03T08:30:00.000Z",
    }

    await (autoCheckinAlarmSchedule as any).scheduleDailyAlarm({
      ...(DEFAULT_PREFERENCES as any).autoCheckin,
      windowStart: "invalid",
      windowEnd: "invalid",
    })

    expect(schedulerTestState.storedStatus).toEqual({
      lastRunResult: "success",
      nextDailyScheduledAt: undefined,
      dailyAlarmTargetDay: undefined,
      nextScheduledAt: undefined,
    })
  })

  it("clears stored daily schedule metadata when daily alarm creation fails", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 9, 0, 0)
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const staleTime = new Date(2024, 0, 1, 9, 30, 0, 0)
    schedulerTestState.storedStatus = {
      lastRunResult: "success",
      nextDailyScheduledAt: staleTime.toISOString(),
      dailyAlarmTargetDay: formatLocalDayKey(staleTime),
      nextScheduledAt: staleTime.toISOString(),
    }
    mockedBrowserApi.createAlarm.mockRejectedValueOnce(
      new Error("daily create failed"),
    )

    await autoCheckinScheduler.scheduleNextRun()

    expect(schedulerTestState.storedStatus.lastRunResult).toBe("success")
    expect(schedulerTestState.storedStatus.nextDailyScheduledAt).toBeUndefined()
    expect(schedulerTestState.storedStatus.dailyAlarmTargetDay).toBeUndefined()
    expect(schedulerTestState.storedStatus.nextScheduledAt).toBeUndefined()

    vi.useRealTimers()
  })

  it("falls back to tomorrow's deterministic time when same-day catch-up is no longer possible", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 23, 59, 59, 999)
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "08:00",
        windowEnd: "09:00",
        scheduleMode: "deterministic",
        deterministicTime: "08:30",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const expectedTime = new Date(2024, 0, 2, 8, 30, 0, 0)
    const expectedTargetDay = formatLocalDayKey(expectedTime)

    await autoCheckinScheduler.scheduleNextRun()

    expect(schedulerTestState.alarmStore.autoCheckinDaily.scheduledTime).toBe(
      expectedTime.getTime(),
    )
    expect(schedulerTestState.storedStatus.nextDailyScheduledAt).toBe(
      expectedTime.toISOString(),
    )
    expect(schedulerTestState.storedStatus.dailyAlarmTargetDay).toBe(
      expectedTargetDay,
    )
    expect(schedulerTestState.storedStatus.nextScheduledAt).toBe(
      expectedTime.toISOString(),
    )

    vi.useRealTimers()
  })

  it("allows startup-restore catch-up inside a cross-midnight window", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 2, 1, 0, 0)
    const catchUpDelayMs = 60_000
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "23:00",
        windowEnd: "02:00",
        scheduleMode: "deterministic",
        deterministicTime: "00:30",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const today = formatLocalDayKey(now)
    const expectedTime = new Date(now.getTime() + catchUpDelayMs)

    await autoCheckinScheduler.scheduleNextRun({
      preserveExisting: true,
      allowCatchUp: true,
    })

    expect(schedulerTestState.alarmStore.autoCheckinDaily.scheduledTime).toBe(
      expectedTime.getTime(),
    )
    expect(schedulerTestState.storedStatus.nextDailyScheduledAt).toBe(
      expectedTime.toISOString(),
    )
    expect(schedulerTestState.storedStatus.dailyAlarmTargetDay).toBe(today)
    expect(schedulerTestState.storedStatus.nextScheduledAt).toBe(
      expectedTime.toISOString(),
    )

    vi.useRealTimers()
  })
})
