// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import {
  mockedBrowserApi,
  mockedUserPreferences,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("autoCheckinScheduler.updateSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })

  it("does not catch up today when settings enable deterministic scheduling after the fixed time", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 10, 0, 0)
    const deterministicTime = "08:30"
    vi.setSystemTime(now)

    const currentConfig = {
      ...(DEFAULT_PREFERENCES as any).autoCheckin,
      globalEnabled: true,
      pretriggerDailyOnUiOpen: false,
      windowStart: "08:00",
      windowEnd: "12:00",
      scheduleMode: "random",
      deterministicTime,
      retryStrategy: {
        enabled: false,
        intervalMinutes: 30,
        maxAttemptsPerDay: 3,
      },
    }
    const updatedConfig = {
      ...currentConfig,
      scheduleMode: "deterministic",
      deterministicTime,
    }

    mockedUserPreferences.getPreferences
      .mockResolvedValueOnce({ autoCheckin: currentConfig })
      .mockResolvedValueOnce({ autoCheckin: updatedConfig })

    const expectedTime = new Date(2024, 0, 2, 8, 30, 0, 0)
    const expectedTargetDay = formatLocalDayKey(expectedTime)

    await autoCheckinScheduler.updateSettings({
      scheduleMode: "deterministic",
      deterministicTime,
    })

    expect(mockedUserPreferences.savePreferences).toHaveBeenCalledWith({
      autoCheckin: updatedConfig,
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
})
