// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { autoCheckinAlarmSchedule } from "~/services/checkin/autoCheckin/scheduling/alarmSchedule"
import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import {
  mockedBrowserApi,
  mockedUserPreferences,
  SCHEDULED_EXECUTION,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("autoCheckinScheduler daily alarm helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("defaults daily alarm runs to the background source", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    vi.spyOn(autoCheckinScheduler as any, "scheduleNextRun").mockResolvedValue(
      undefined,
    )

    await (autoCheckinScheduler as any).handleDailyAlarm(
      {
        name: "autoCheckinDaily",
        scheduledTime: Date.now(),
      },
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      SCHEDULED_EXECUTION,
    )

    expect(runSpy).toHaveBeenCalledWith({
      runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      protectionBypassExecution: SCHEDULED_EXECUTION,
    })
    vi.useRealTimers()
  })

  it("ignores duplicate daily alarms while a run for today is already in flight", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))
    schedulerTestState.storedStatus = { dailyAlarmTargetDay: "2026-01-23" }
    let finish!: () => void
    const work = new Promise<void>((resolve) => {
      finish = resolve
    })
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockReturnValueOnce(work)
    vi.spyOn(autoCheckinScheduler as any, "scheduleNextRun").mockResolvedValue(
      undefined,
    )
    const alarm = { name: "autoCheckinDaily", scheduledTime: Date.now() }
    const activeRun = (autoCheckinScheduler as any).handleDailyAlarm(
      alarm,
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      SCHEDULED_EXECUTION,
    )
    await expect(
      (autoCheckinScheduler as any).handleDailyAlarm(alarm),
    ).resolves.toBeUndefined()
    expect(runSpy).toHaveBeenCalledTimes(1)
    finish()
    await activeRun
    runSpy.mockResolvedValueOnce(undefined)
    await (autoCheckinScheduler as any).handleDailyAlarm(
      alarm,
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      SCHEDULED_EXECUTION,
    )
    expect(runSpy).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it("treats stale daily alarms as no-ops and reschedules instead of running", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    schedulerTestState.storedStatus = { dailyAlarmTargetDay: "2026-01-22" }
    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")
    const scheduleSpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleNextRun")
      .mockResolvedValueOnce(undefined)

    await expect(
      (autoCheckinScheduler as any).handleDailyAlarm({
        name: "autoCheckinDaily",
        scheduledTime: Date.now(),
      }),
    ).resolves.toBeUndefined()

    expect(runSpy).not.toHaveBeenCalled()
    expect(scheduleSpy).toHaveBeenCalledTimes(1)
    schedulerTestState.storedStatus = {
      dailyAlarmTargetDay: formatLocalDayKey(new Date()),
    }
    runSpy.mockResolvedValueOnce(undefined)
    scheduleSpy.mockResolvedValueOnce(undefined)
    await (autoCheckinScheduler as any).handleDailyAlarm(
      { name: "autoCheckinDaily", scheduledTime: Date.now() },
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      SCHEDULED_EXECUTION,
    )
    expect(runSpy).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it("treats stale daily alarms as no-ops when only the alarm scheduledTime reveals a past day", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 23, 9, 0, 0))

    schedulerTestState.storedStatus = {
      pendingRetry: false,
    } as any
    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")
    const scheduleSpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleNextRun")
      .mockResolvedValueOnce(undefined)

    await expect(
      (autoCheckinScheduler as any).handleDailyAlarm({
        name: "autoCheckinDaily",
        scheduledTime: new Date(2026, 0, 22, 23, 30, 0).getTime(),
      }),
    ).resolves.toBeUndefined()

    expect(runSpy).not.toHaveBeenCalled()
    expect(scheduleSpy).toHaveBeenCalledTimes(1)
    schedulerTestState.storedStatus = {
      dailyAlarmTargetDay: formatLocalDayKey(new Date()),
    }
    runSpy.mockResolvedValueOnce(undefined)
    scheduleSpy.mockResolvedValueOnce(undefined)
    await (autoCheckinScheduler as any).handleDailyAlarm(
      { name: "autoCheckinDaily", scheduledTime: Date.now() },
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      SCHEDULED_EXECUTION,
    )
    expect(runSpy).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it("reschedules retry alarms even when retry execution throws", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const runRetrySpy = vi
      .spyOn(autoCheckinScheduler as any, "runRetryCheckins")
      .mockRejectedValueOnce(new Error("retry exploded"))
    const scheduleRetrySpy = vi
      .spyOn(autoCheckinAlarmSchedule as any, "scheduleRetryAlarm")
      .mockResolvedValueOnce(undefined)

    await expect(
      (autoCheckinScheduler as any).handleRetryAlarm({
        name: "autoCheckinRetry",
        scheduledTime: Date.now(),
      }),
    ).resolves.toBeUndefined()

    expect(runRetrySpy).toHaveBeenCalledTimes(1)
    expect(scheduleRetrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      }),
    )

    vi.useRealTimers()
  })

  it("clears stale retry alarms when only the alarm scheduledTime reveals a past day", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 2, 9, 0, 0))

    schedulerTestState.storedStatus = {
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: {
          a: 1,
        },
      },
      pendingRetry: true,
      nextRetryScheduledAt: new Date(2024, 0, 1, 23, 30, 0).toISOString(),
    } as any

    const runRetrySpy = vi.spyOn(
      autoCheckinScheduler as any,
      "runRetryCheckins",
    )

    await expect(
      (autoCheckinScheduler as any).handleRetryAlarm({
        name: "autoCheckinRetry",
        scheduledTime: new Date(2024, 0, 1, 23, 30, 0).getTime(),
      }),
    ).resolves.toBeUndefined()

    expect(runRetrySpy).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.nextRetryScheduledAt).toBeUndefined()

    vi.useRealTimers()
  })

  it("restores a same-day daily alarm when the browser schedules it for tomorrow", async () => {
    vi.useFakeTimers()
    const now = new Date(2026, 0, 23, 23, 58, 0, 0)
    vi.setSystemTime(now)

    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)
    const tomorrow = new Date(2026, 0, 24, 8, 0, 0, 0)
    let getAlarmCall = 0

    mockedBrowserApi.getAlarm.mockImplementation(async () => {
      getAlarmCall += 1
      return {
        scheduledTime:
          getAlarmCall === 1 ? tomorrow.getTime() : endOfToday.getTime(),
      }
    })

    const scheduled = await (
      autoCheckinAlarmSchedule as any
    ).createDailyAlarmForToday(tomorrow.getTime())

    expect(mockedBrowserApi.createAlarm).toHaveBeenNthCalledWith(
      1,
      "autoCheckinDaily",
      {
        when: endOfToday.getTime(),
      },
    )
    expect(mockedBrowserApi.createAlarm).toHaveBeenNthCalledWith(
      2,
      "autoCheckinDaily",
      {
        when: endOfToday.getTime(),
      },
    )
    expect(scheduled.toISOString()).toBe(endOfToday.toISOString())

    vi.useRealTimers()
  })

  it("throws when createDailyAlarmForToday cannot schedule a same-day alarm", async () => {
    vi.useFakeTimers()
    const now = new Date(2026, 0, 23, 23, 59, 59, 999)
    vi.setSystemTime(now)

    await expect(
      (autoCheckinAlarmSchedule as any).createDailyAlarmForToday(now.getTime()),
    ).rejects.toThrow("Cannot schedule daily alarm for today")

    vi.useRealTimers()
  })
})
