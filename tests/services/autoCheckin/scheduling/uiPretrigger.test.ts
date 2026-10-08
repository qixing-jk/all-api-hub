// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import {
  mockedBrowserApi,
  mockedUserPreferences,
  pretriggerDailyOnUiOpenForTest,
  SCHEDULED_EXECUTION,
  schedulerTestState,
  uiOpenExecution,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("autoCheckinScheduler.pretriggerDailyOnUiOpen", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
      },
    })
  })

  it("starts today's daily run early when eligible", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    schedulerTestState.alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now() + 60_000,
    }

    const today = formatLocalDayKey(new Date())

    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockImplementation(async () => {
        await autoCheckinStorage.updateStatus(() => ({
          patch: {
            lastDailyRunDay: today,
            lastRunResult: "success",
            summary: {
              totalEligible: 2,
              executed: 1,
              successCount: 1,
              failedCount: 0,
              skippedCount: 1,
              needsRetry: false,
            },
            pendingRetry: false,
          },
        }))
      })

    const result = await pretriggerDailyOnUiOpenForTest({
      requestId: "req-1",
    })

    expect(result.started).toBe(true)
    expect(result.eligible).toBe(true)
    expect(runSpy).toHaveBeenCalledWith({
      runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      protectionBypassExecution: uiOpenExecution(
        TEMP_WINDOW_REQUEST_SOURCES.Popup,
      ),
    })
    expect(result.summary).toEqual(
      expect.objectContaining({
        totalEligible: 2,
        executed: 1,
        successCount: 1,
        failedCount: 0,
        skippedCount: 1,
      }),
    )

    vi.useRealTimers()
  })

  it("still starts when the pretrigger notification broadcast fails and recalculates summary from per-account results", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    schedulerTestState.alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now() + 60_000,
    }

    mockedBrowserApi.sendRuntimeMessage.mockRejectedValueOnce(
      new Error("popup closed"),
    )

    vi.spyOn(autoCheckinScheduler as any, "runCheckins").mockImplementation(
      async () => {
        await autoCheckinStorage.updateStatus(
          () =>
            ({
              patch: {
                lastDailyRunDay: "2026-01-23",
                lastRunResult: "failed",
                perAccount: {
                  a: { status: "success" },
                  b: { status: "failed" },
                  c: { status: "skipped" },
                },
                summary: undefined,
                pendingRetry: true,
              },
            }) as any,
        )
      },
    )

    const result = await pretriggerDailyOnUiOpenForTest({
      requestId: "req-notify-fails",
    })

    expect(result).toMatchObject({
      started: true,
      eligible: true,
      lastRunResult: "failed",
      summary: {
        totalEligible: 3,
        executed: 2,
        successCount: 1,
        failedCount: 1,
        skippedCount: 1,
        needsRetry: true,
      },
    })
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      {
        action: RuntimeActionIds.AutoCheckinPretriggerStarted,
        requestId: "req-notify-fails",
      },
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })

  it("does not start when current time is outside the window", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T11:00:00"))

    schedulerTestState.alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now() + 60_000,
    }

    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")

    const result = await pretriggerDailyOnUiOpenForTest({
      requestId: "req-2",
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(false)
    expect(result.ineligibleReason).toBe("outside_time_window")
    expect(runSpy).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it("returns eligible=true but does not start in dryRun mode", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    schedulerTestState.alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now() + 60_000,
    }

    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")

    const result = await pretriggerDailyOnUiOpenForTest({
      dryRun: true,
      debug: true,
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(true)
    expect(runSpy).not.toHaveBeenCalled()
    expect(result.debug).toEqual(
      expect.objectContaining({
        today: expect.any(String),
        isWithinWindow: true,
        dailyAlarmScheduledTime: expect.any(Number),
      }),
    )

    vi.useRealTimers()
  })

  it("does not start when today's daily run already executed", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const today = formatLocalDayKey(new Date())
    schedulerTestState.storedStatus = { lastDailyRunDay: today }

    schedulerTestState.alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now() + 60_000,
    }

    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")

    const result = await pretriggerDailyOnUiOpenForTest({
      requestId: "req-3",
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(false)
    expect(result.ineligibleReason).toBe("already_ran_today")
    expect(runSpy).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it("does not start when today's daily run is already in flight", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const today = formatLocalDayKey(new Date())
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
    schedulerTestState.alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now() + 60_000,
    }
    const activeRun = (autoCheckinScheduler as any).handleDailyAlarm(
      schedulerTestState.alarmStore.autoCheckinDaily,
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      SCHEDULED_EXECUTION,
    )

    const result = await pretriggerDailyOnUiOpenForTest({
      debug: true,
    })

    expect(result).toMatchObject({
      started: false,
      eligible: false,
      ineligibleReason: "daily_run_in_flight",
      debug: expect.objectContaining({
        dailyRunInFlightDay: today,
      }),
    })
    expect(runSpy).toHaveBeenCalledTimes(1)
    finish()
    await activeRun
    vi.useRealTimers()
  })

  it("returns alarms_api_unavailable when the alarms API cannot be used", async () => {
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(false)

    const result = await pretriggerDailyOnUiOpenForTest({
      debug: true,
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(false)
    expect(result.ineligibleReason).toBe("alarms_api_unavailable")
    expect(mockedUserPreferences.getPreferences).not.toHaveBeenCalled()
  })

  it("returns global_disabled and pretrigger_disabled for the corresponding config gates", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: false,
        pretriggerDailyOnUiOpen: true,
      },
    })

    await expect(
      pretriggerDailyOnUiOpenForTest({ debug: true }),
    ).resolves.toMatchObject({
      started: false,
      eligible: false,
      ineligibleReason: "global_disabled",
      debug: expect.objectContaining({
        windowStart: (DEFAULT_PREFERENCES as any).autoCheckin.windowStart,
        windowEnd: (DEFAULT_PREFERENCES as any).autoCheckin.windowEnd,
      }),
    })

    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
      },
    })

    await expect(
      pretriggerDailyOnUiOpenForTest({ debug: true }),
    ).resolves.toMatchObject({
      started: false,
      eligible: false,
      ineligibleReason: "pretrigger_disabled",
    })
  })

  it("returns invalid_time_window when the configured time strings cannot be parsed", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
        windowStart: "08:xx",
        windowEnd: "10:00",
      },
    })

    const result = await pretriggerDailyOnUiOpenForTest({
      debug: true,
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(false)
    expect(result.ineligibleReason).toBe("invalid_time_window")
    expect(result.debug).toEqual(
      expect.objectContaining({
        windowStartMinutes: null,
        windowEndMinutes: 600,
      }),
    )
  })

  it("returns daily_alarm_missing when no daily alarm is scheduled", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const result = await pretriggerDailyOnUiOpenForTest({
      debug: true,
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(false)
    expect(result.ineligibleReason).toBe("daily_alarm_missing")
    expect(result.debug).toEqual(
      expect.objectContaining({
        dailyAlarmScheduledTime: null,
      }),
    )

    vi.useRealTimers()
  })

  it("returns daily_alarm_not_today when the stored alarm target day is stale", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    schedulerTestState.alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: new Date("2026-01-23T09:30:00").getTime(),
    }
    schedulerTestState.storedStatus = {
      dailyAlarmTargetDay: "2026-01-22",
    }

    const result = await pretriggerDailyOnUiOpenForTest({
      debug: true,
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(false)
    expect(result.ineligibleReason).toBe("daily_alarm_not_today")
    expect(result.debug).toEqual(
      expect.objectContaining({
        scheduledTargetDay: "2026-01-23",
        storedTargetDay: "2026-01-22",
        targetDay: "2026-01-22",
      }),
    )

    vi.useRealTimers()
  })
})
