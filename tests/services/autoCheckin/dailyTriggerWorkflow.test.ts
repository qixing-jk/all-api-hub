import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { DailyTriggerWorkflow } from "~/services/checkin/autoCheckin/scheduling/dailyTriggerWorkflow"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { AUTO_CHECKIN_SESSION_STORAGE_KEYS } from "~/services/core/storageKeys"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { getAlarm, hasAlarmsAPI } from "~/utils/browser/alarms"
import { automaticExecution } from "~~/tests/services/protectionBypass/fixtures"

vi.mock("~/services/checkin/autoCheckin/storage", () => ({
  autoCheckinStorage: { getStatus: vi.fn().mockResolvedValue(null) },
}))

vi.mock("~/utils/browser/alarms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/alarms")>()),
  hasAlarmsAPI: vi.fn(() => true),
  getAlarm: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: vi.fn() },
}))

beforeEach(async () => {
  await browser.storage.session.clear()
  vi.clearAllMocks()
  vi.mocked(hasAlarmsAPI).mockReturnValue(true)
  vi.mocked(getAlarm).mockResolvedValue({
    name: "daily",
    scheduledTime: new Date(2024, 0, 1, 10, 0, 0).getTime(),
  } as browser.alarms.Alarm)
  vi.mocked(userPreferences.getPreferences).mockResolvedValue({
    autoCheckin: {
      ...(DEFAULT_PREFERENCES as any).autoCheckin,
      globalEnabled: true,
      pretriggerDailyOnUiOpen: true,
      windowStart: "00:00",
      windowEnd: "23:59",
    },
  } as any)
  vi.mocked(autoCheckinStorage.getStatus).mockResolvedValue(null)
})

afterEach(() => vi.useRealTimers())

it("restores the failed-write cooldown after the worker creates a new workflow", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))
  const runCheckins = vi.fn().mockResolvedValue({ persisted: false })
  const deps = {
    dailyAlarmName: "daily",
    runCheckins,
    scheduleNextRun: vi.fn().mockResolvedValue(undefined),
  }
  const execution = automaticExecution("checkin", "scheduled")
  await new DailyTriggerWorkflow(deps).handleDailyAlarm(
    { name: "daily" } as browser.alarms.Alarm,
    TEMP_WINDOW_REQUEST_SOURCES.Background,
    execution,
  )
  vi.setSystemTime(new Date(2024, 0, 1, 9, 1, 0))
  await expect(
    new DailyTriggerWorkflow(deps).pretriggerDailyOnUiOpen({
      protectionBypassExecution: execution,
    }),
  ).resolves.toMatchObject({
    started: false,
    ineligibleReason: "status_write_failed_recently",
  })
  expect(runCheckins).toHaveBeenCalledTimes(1)
  runCheckins.mockResolvedValue({ persisted: true })
  await new DailyTriggerWorkflow(deps).handleDailyAlarm(
    { name: "daily" } as browser.alarms.Alarm,
    TEMP_WINDOW_REQUEST_SOURCES.Background,
    execution,
  )
  await expect(
    new DailyTriggerWorkflow(deps).pretriggerDailyOnUiOpen({
      protectionBypassExecution: execution,
      dryRun: true,
    }),
  ).resolves.toMatchObject({ eligible: true })
})

it("blocks pre-trigger admission until an unreadable session guard recovers", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))
  const runCheckins = vi.fn().mockResolvedValue({ persisted: false })
  const deps = {
    dailyAlarmName: "daily",
    runCheckins,
    scheduleNextRun: vi.fn().mockResolvedValue(undefined),
  }
  const execution = automaticExecution("checkin", "scheduled")
  await new DailyTriggerWorkflow(deps).handleDailyAlarm(
    { name: "daily" } as browser.alarms.Alarm,
    TEMP_WINDOW_REQUEST_SOURCES.Background,
    execution,
  )
  const workflow = new DailyTriggerWorkflow(deps)
  const sessionRead = vi
    .spyOn(browser.storage.session, "get")
    .mockRejectedValueOnce(new Error("session unavailable"))
  try {
    const pretrigger = () =>
      workflow.pretriggerDailyOnUiOpen({
        protectionBypassExecution: execution,
      })
    await expect(pretrigger()).resolves.toMatchObject({
      started: false,
      eligible: false,
      ineligibleReason: "status_write_guard_unavailable",
    })
    expect(runCheckins).toHaveBeenCalledTimes(1)
    await expect(pretrigger()).resolves.toMatchObject({
      started: false,
      ineligibleReason: "status_write_failed_recently",
    })
    expect(sessionRead).toHaveBeenCalledTimes(2)
    expect(runCheckins).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date(2024, 0, 1, 9, 16, 0))
    runCheckins.mockResolvedValue({ persisted: true })
    await expect(pretrigger()).resolves.toMatchObject({
      started: true,
      eligible: true,
    })
    expect(runCheckins).toHaveBeenCalledTimes(2)
  } finally {
    sessionRead.mockRestore()
  }
})

it("reschedules and releases admission after a daily execution rejects", async () => {
  vi.useFakeTimers()
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
  vi.useRealTimers()
})

it("keeps the worker cooldown when updating an older session marker fails", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))
  const runCheckins = vi.fn().mockResolvedValue({ persisted: true })
  const workflow = new DailyTriggerWorkflow({
    dailyAlarmName: "daily",
    runCheckins,
    scheduleNextRun: vi.fn().mockResolvedValue(undefined),
  })
  const execution = automaticExecution("checkin", "scheduled")
  const trigger = () =>
    workflow.handleDailyAlarm(
      { name: "daily" } as browser.alarms.Alarm,
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      execution,
    )
  await trigger()
  runCheckins.mockResolvedValue({ persisted: false })
  const sessionWrite = vi
    .spyOn(browser.storage.session, "set")
    .mockRejectedValue(new Error("session unavailable"))
  const sessionRead = vi
    .spyOn(browser.storage.session, "get")
    .mockResolvedValue({
      [AUTO_CHECKIN_SESSION_STORAGE_KEYS.DAILY_RUN_PERSIST_FAILED_AT]: null,
    })
  try {
    await trigger()
    await expect(
      workflow.pretriggerDailyOnUiOpen({
        protectionBypassExecution: execution,
      }),
    ).resolves.toMatchObject({
      started: false,
      ineligibleReason: "status_write_failed_recently",
    })
    expect(runCheckins).toHaveBeenCalledTimes(2)
  } finally {
    sessionWrite.mockRestore()
    sessionRead.mockRestore()
  }
})

it("suppresses the pre-trigger for a bounded window after an unpersisted daily run", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

  const runCheckins = vi.fn().mockResolvedValue({ persisted: false })
  const scheduleNextRun = vi.fn().mockResolvedValue(undefined)
  const workflow = new DailyTriggerWorkflow({
    dailyAlarmName: "daily",
    runCheckins,
    scheduleNextRun,
  })
  const execution = automaticExecution("checkin", "scheduled")

  await workflow.handleDailyAlarm(
    { name: "daily" } as browser.alarms.Alarm,
    TEMP_WINDOW_REQUEST_SOURCES.Background,
    execution,
  )

  const suppressed = await workflow.pretriggerDailyOnUiOpen({
    protectionBypassExecution: execution,
  })

  expect(suppressed).toMatchObject({
    started: false,
    eligible: false,
    ineligibleReason: "status_write_failed_recently",
  })
  expect(runCheckins).toHaveBeenCalledTimes(1)

  // The guard window passes and admission resumes; a persisted run clears it.
  vi.setSystemTime(new Date(2024, 0, 1, 9, 16, 0))
  runCheckins.mockResolvedValue({ persisted: true })

  const admitted = await workflow.pretriggerDailyOnUiOpen({
    protectionBypassExecution: execution,
  })

  expect(admitted).toMatchObject({ started: true, eligible: true })
  expect(runCheckins).toHaveBeenCalledTimes(2)
  expect(scheduleNextRun).toHaveBeenCalledTimes(2)

  vi.useRealTimers()
})
