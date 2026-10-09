// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  mockedBrowserApi,
  SCHEDULED_EXECUTION,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("autoCheckinScheduler debug helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })

  it("delegates debugTriggerDailyAlarmNow to the daily alarm handler", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const handleDailyAlarmSpy = vi
      .spyOn(autoCheckinScheduler as any, "handleDailyAlarm")
      .mockResolvedValue(undefined)

    await autoCheckinScheduler.debugTriggerDailyAlarmNow()

    expect(handleDailyAlarmSpy).toHaveBeenCalledWith(
      {
        name: "autoCheckinDaily",
        scheduledTime: Date.now(),
      },
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      SCHEDULED_EXECUTION,
    )

    vi.useRealTimers()
  })

  it("delegates debugTriggerRetryAlarmNow to the retry alarm handler", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const handleRetryAlarmSpy = vi
      .spyOn(autoCheckinScheduler as any, "handleRetryAlarm")
      .mockResolvedValue(undefined)

    await autoCheckinScheduler.debugTriggerRetryAlarmNow()

    expect(handleRetryAlarmSpy).toHaveBeenCalledWith({
      name: "autoCheckinRetry",
      scheduledTime: Date.now(),
    })

    vi.useRealTimers()
  })

  it("does not rewrite status when debugResetLastDailyRunDay has nothing to clear", async () => {
    schedulerTestState.storedStatus = {
      pendingRetry: true,
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
    }

    await autoCheckinScheduler.debugResetLastDailyRunDay()

    expect(schedulerTestState.statusWriteCount).toBe(0)
    expect(schedulerTestState.storedStatus).toEqual({
      pendingRetry: true,
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
    })
  })

  it("clears only lastDailyRunDay when debugResetLastDailyRunDay has an existing marker", async () => {
    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2026-01-23",
      pendingRetry: true,
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
    }

    await autoCheckinScheduler.debugResetLastDailyRunDay()

    expect(schedulerTestState.statusWriteCount).toBe(1)
    expect(schedulerTestState.storedStatus).toEqual({
      pendingRetry: true,
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    ;(autoCheckinScheduler as any).isInitialized = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
    ;(autoCheckinScheduler as any).isInitialized = false
  })

  it("clamps debugScheduleDailyAlarmForToday to at least one minute and persists today's target day", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    schedulerTestState.storedStatus = {
      lastRunResult: "success",
    }

    const scheduledAt =
      await autoCheckinScheduler.debugScheduleDailyAlarmForToday({
        minutesFromNow: 0,
      })

    expect(scheduledAt).toBe(Date.now() + 60_000)
    expect(schedulerTestState.alarmStore.autoCheckinDaily?.scheduledTime).toBe(
      scheduledAt,
    )
    expect(schedulerTestState.storedStatus.nextDailyScheduledAt).toBe(
      new Date(scheduledAt).toISOString(),
    )
    expect(schedulerTestState.storedStatus.dailyAlarmTargetDay).toBe(
      "2026-01-23",
    )
    expect(schedulerTestState.storedStatus.nextScheduledAt).toBe(
      new Date(scheduledAt).toISOString(),
    )

    vi.useRealTimers()
  })

  it("rejects debugScheduleDailyAlarmForToday when the alarms API is unavailable", async () => {
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(false)

    await expect(
      autoCheckinScheduler.debugScheduleDailyAlarmForToday(),
    ).rejects.toThrow("[AutoCheckin] Alarms API not available")
  })
})
