// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  mockedBrowserApi,
  mockedUserPreferences,
  SCHEDULED_EXECUTION,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("autoCheckinScheduler.initialize", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(autoCheckinScheduler as any).isInitialized = false
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
      },
    })
  })

  it("should set up alarm listener and schedule next run when alarms API is available", async () => {
    const scheduleSpy = vi.spyOn(autoCheckinScheduler as any, "scheduleNextRun")

    await autoCheckinScheduler.initialize()

    expect(mockedBrowserApi.onAlarm).toHaveBeenCalledTimes(1)
    expect(scheduleSpy).toHaveBeenCalled()
  })

  it("does not register duplicate listeners when initialize is called twice", async () => {
    const scheduleSpy = vi.spyOn(autoCheckinScheduler as any, "scheduleNextRun")

    await autoCheckinScheduler.initialize()
    await autoCheckinScheduler.initialize()

    expect(mockedBrowserApi.onAlarm).toHaveBeenCalledTimes(1)
    expect(scheduleSpy).toHaveBeenCalledTimes(1)
  })

  it("warns and skips scheduling when the alarms API is unavailable", async () => {
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(false)
    const scheduleSpy = vi.spyOn(autoCheckinScheduler as any, "scheduleNextRun")

    await autoCheckinScheduler.initialize()

    expect(mockedBrowserApi.onAlarm).not.toHaveBeenCalled()
    expect(scheduleSpy).not.toHaveBeenCalled()
    expect((autoCheckinScheduler as any).isInitialized).toBe(true)
  })

  it("keeps alarm callbacks best-effort when daily or retry handlers throw", async () => {
    const handleDailyAlarmSpy = vi
      .spyOn(autoCheckinScheduler as any, "handleDailyAlarm")
      .mockRejectedValueOnce(new Error("daily failed"))
    const handleRetryAlarmSpy = vi
      .spyOn(autoCheckinScheduler as any, "handleRetryAlarm")
      .mockRejectedValueOnce(new Error("retry failed"))

    await autoCheckinScheduler.initialize()

    const alarmListener = mockedBrowserApi.onAlarm.mock.calls[0]?.[0]
    expect(alarmListener).toBeTypeOf("function")

    await expect(
      alarmListener({
        name: "autoCheckinDaily",
        scheduledTime: Date.now(),
      }),
    ).resolves.toBeUndefined()
    await expect(
      alarmListener({
        name: "autoCheckinRetry",
        scheduledTime: Date.now() + 60_000,
      }),
    ).resolves.toBeUndefined()

    expect(handleDailyAlarmSpy).toHaveBeenCalledTimes(1)
    expect(handleRetryAlarmSpy).toHaveBeenCalledTimes(1)

    handleDailyAlarmSpy.mockRestore()
    handleRetryAlarmSpy.mockRestore()
  })

  it("routes daily and retry alarm events through the installed listener", async () => {
    const handleDailyAlarmSpy = vi
      .spyOn(autoCheckinScheduler as any, "handleDailyAlarm")
      .mockResolvedValue(undefined)
    const handleRetryAlarmSpy = vi
      .spyOn(autoCheckinScheduler as any, "handleRetryAlarm")
      .mockResolvedValue(undefined)

    await autoCheckinScheduler.initialize()

    const alarmListener = mockedBrowserApi.onAlarm.mock.calls[0]?.[0]
    expect(alarmListener).toBeTypeOf("function")

    const dailyAlarm = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now(),
    }
    const retryAlarm = {
      name: "autoCheckinRetry",
      scheduledTime: Date.now() + 60_000,
    }

    await alarmListener(dailyAlarm)
    await alarmListener(retryAlarm)

    expect(handleDailyAlarmSpy).toHaveBeenCalledWith(
      dailyAlarm,
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      SCHEDULED_EXECUTION,
    )
    expect(handleRetryAlarmSpy).toHaveBeenCalledWith(retryAlarm)

    handleDailyAlarmSpy.mockRestore()
    handleRetryAlarmSpy.mockRestore()
  })

  it("restores the schedule when the installed listener receives the legacy alarm", async () => {
    const scheduleSpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleNextRun")
      .mockResolvedValue(undefined)

    await autoCheckinScheduler.initialize()

    const alarmListener = mockedBrowserApi.onAlarm.mock.calls[0]?.[0]
    expect(alarmListener).toBeTypeOf("function")

    await alarmListener({
      name: "autoCheckin",
      scheduledTime: Date.now(),
    })

    expect(scheduleSpy).toHaveBeenCalledTimes(2)
    expect(scheduleSpy).toHaveBeenNthCalledWith(1, {
      preserveExisting: true,
      allowCatchUp: true,
    })
    expect(scheduleSpy).toHaveBeenNthCalledWith(2, {
      allowCatchUp: true,
    })

    scheduleSpy.mockRestore()
  })
})
