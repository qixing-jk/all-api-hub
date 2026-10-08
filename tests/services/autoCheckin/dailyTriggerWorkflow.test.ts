import { expect, it, vi } from "vitest"

import { DailyTriggerWorkflow } from "~/services/checkin/autoCheckin/dailyTriggerWorkflow"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { automaticExecution } from "~~/tests/services/protectionBypass/fixtures"

vi.mock("~/services/checkin/autoCheckin/storage", () => ({
  autoCheckinStorage: { getStatus: vi.fn().mockResolvedValue(null) },
}))

it("reschedules and releases admission after a daily execution rejects", async () => {
  const runCheckins = vi.fn().mockRejectedValue(new Error("network"))
  const scheduleNextRun = vi.fn().mockResolvedValue(undefined)
  const workflow = new DailyTriggerWorkflow({
    dailyAlarmName: "daily",
    runCheckins,
    scheduleNextRun,
  })
  const trigger = () =>
    workflow.handleDailyAlarm(
      { name: "daily" } as browser.alarms.Alarm,
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      automaticExecution("checkin", "scheduled"),
    )
  await trigger()
  await trigger()
  expect(autoCheckinStorage.getStatus).toHaveBeenCalledTimes(2)
  expect(runCheckins).toHaveBeenCalledTimes(2)
  expect(scheduleNextRun).toHaveBeenCalledTimes(2)
})
