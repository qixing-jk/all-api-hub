// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import {
  getAutoCheckinAccountInfo,
  getAutoCheckinStatus,
  pretriggerAutoCheckinDailyOnUiOpen,
  resetAutoCheckinLastDailyRunDay,
  retryAutoCheckinAccount,
  runAutoCheckinNow,
  scheduleAutoCheckinDailyAlarmForToday,
  triggerAutoCheckinDailyAlarmNow,
  triggerAutoCheckinRetryAlarmNow,
  updateAutoCheckinSettings,
} from "~/services/checkin/autoCheckin/scheduling/schedulerMessaging"
import {
  INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { getErrorMessage } from "~/utils/core/error"
import {
  ACCOUNT_REFRESH_EXECUTION,
  mockedAutoCheckinStorage,
  OPTIONS_MANUAL_EXECUTION,
  RETRY_EXECUTION,
  retryAccountExecution,
  uiOpenExecution,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

describe("scheduling/schedulerMessaging", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })
  it("should run checkins on autoCheckin:runNow", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    await expect(
      runAutoCheckinNow({
        protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
      }),
    ).resolves.toEqual({ success: true })

    expect(runSpy).toHaveBeenCalledWith({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: undefined,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Options,
      protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
    })
  })

  it("rejects automatic account-refresh execution at the manual run boundary", async () => {
    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")

    await expect(
      runAutoCheckinNow({
        protectionBypassExecution: ACCOUNT_REFRESH_EXECUTION,
      }),
    ).resolves.toEqual({
      success: false,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    })

    expect(runSpy).not.toHaveBeenCalled()
  })

  it("rejects another valid user command at the manual run boundary", async () => {
    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")

    await expect(
      runAutoCheckinNow({
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
        ),
      }),
    ).resolves.toEqual({
      success: false,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    })

    expect(runSpy).not.toHaveBeenCalled()
  })

  it("should pass accountIds for targeted manual runs", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    await expect(
      runAutoCheckinNow({
        accountIds: ["a"],
        protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
      }),
    ).resolves.toEqual({ success: true })

    expect(runSpy).toHaveBeenCalledWith({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["a"],
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Options,
      protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
    })
  })

  it("should trim and dedupe targeted accountIds before running", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    await expect(
      runAutoCheckinNow({
        accountIds: [" a ", "a", "b "],
        protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
      }),
    ).resolves.toEqual({ success: true })

    expect(runSpy).toHaveBeenCalledWith({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["a", "b"],
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Options,
      protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
    })
  })

  it("should return an error for invalid accountIds payload", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    await expect(runAutoCheckinNow({ accountIds: [] })).resolves.toEqual({
      success: false,
      error: "Invalid payload: accountIds must be a non-empty string[]",
    })

    expect(runSpy).not.toHaveBeenCalled()
  })

  it("should reject non-array accountIds payloads before running", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    await expect(
      runAutoCheckinNow({
        accountIds: "account-1" as any,
        protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
      }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid payload: accountIds must be a non-empty string[]",
    })

    expect(runSpy).not.toHaveBeenCalled()
  })

  it("should reject targeted manual runs when accountIds contain blank or non-string values", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    await expect(
      runAutoCheckinNow({ accountIds: ["account-1", " ", 42] as any }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid payload: accountIds must be a non-empty string[]",
    })

    expect(runSpy).not.toHaveBeenCalled()
  })

  it("should trigger daily alarm handler on autoCheckin:debugTriggerDailyAlarmNow", async () => {
    const debugSpy = vi
      .spyOn(autoCheckinScheduler as any, "debugTriggerDailyAlarmNow")
      .mockResolvedValueOnce(undefined)
    await expect(triggerAutoCheckinDailyAlarmNow()).resolves.toEqual({
      success: true,
    })

    expect(debugSpy).toHaveBeenCalled()
  })

  it("should trigger retry alarm handler on autoCheckin:debugTriggerRetryAlarmNow", async () => {
    const debugSpy = vi
      .spyOn(autoCheckinScheduler as any, "debugTriggerRetryAlarmNow")
      .mockResolvedValueOnce(undefined)
    await expect(triggerAutoCheckinRetryAlarmNow()).resolves.toEqual({
      success: true,
    })

    expect(debugSpy).toHaveBeenCalled()
  })

  it("should return status on autoCheckin:getStatus", async () => {
    const status = { lastRunResult: "success" }
    mockedAutoCheckinStorage.getStatus.mockResolvedValue(status as any)
    await expect(getAutoCheckinStatus()).resolves.toEqual({
      success: true,
      data: status,
    })
  })

  it("should retry a specific account on autoCheckin:retryAccount", async () => {
    const retrySpy = vi
      .spyOn(autoCheckinScheduler as any, "retryAccount")
      .mockResolvedValueOnce(undefined)
    await expect(
      retryAutoCheckinAccount(
        "account-1",
        undefined,
        retryAccountExecution(TEMP_WINDOW_REQUEST_SOURCES.Background),
      ),
    ).resolves.toEqual({ success: true })

    expect(retrySpy).toHaveBeenCalledWith(
      "account-1",
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      retryAccountExecution(TEMP_WINDOW_REQUEST_SOURCES.Background),
    )
  })

  it("rejects another valid user command at the retry boundary", async () => {
    const retrySpy = vi.spyOn(autoCheckinScheduler as any, "retryAccount")

    await expect(
      retryAutoCheckinAccount(
        "account-1",
        TEMP_WINDOW_REQUEST_SOURCES.Options,
        userCommandExecution(PROTECTION_BYPASS_USER_COMMANDS.AddAccount),
      ),
    ).resolves.toEqual({
      success: false,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    })

    expect(retrySpy).not.toHaveBeenCalled()
  })

  it("passes valid popup source through the manual retry message boundary", async () => {
    const retrySpy = vi
      .spyOn(autoCheckinScheduler as any, "retryAccount")
      .mockResolvedValueOnce(undefined)

    await retryAutoCheckinAccount(
      "account-1",
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
      retryAccountExecution(TEMP_WINDOW_REQUEST_SOURCES.Popup),
    )

    expect(retrySpy).toHaveBeenCalledWith(
      "account-1",
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
      retryAccountExecution(TEMP_WINDOW_REQUEST_SOURCES.Popup),
    )
  })

  it("normalizes invalid manual retry source to background", async () => {
    const retrySpy = vi
      .spyOn(autoCheckinScheduler as any, "retryAccount")
      .mockResolvedValueOnce(undefined)

    await retryAutoCheckinAccount(
      "account-1",
      "invalid-source",
      retryAccountExecution(TEMP_WINDOW_REQUEST_SOURCES.Background),
    )

    expect(retrySpy).toHaveBeenCalledWith(
      "account-1",
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      retryAccountExecution(TEMP_WINDOW_REQUEST_SOURCES.Background),
    )
  })

  it("should surface retryAccount failures back to the caller", async () => {
    const retrySpy = vi
      .spyOn(autoCheckinScheduler as any, "retryAccount")
      .mockRejectedValueOnce(new Error("retry failed"))
    ;(
      getErrorMessage as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    )
    await expect(
      retryAutoCheckinAccount(
        "account-1",
        undefined,
        retryAccountExecution(TEMP_WINDOW_REQUEST_SOURCES.Background),
      ),
    ).rejects.toThrow("retry failed")

    expect(retrySpy).toHaveBeenCalledWith(
      "account-1",
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      retryAccountExecution(TEMP_WINDOW_REQUEST_SOURCES.Background),
    )
  })

  it("should reject retry requests without an accountId", async () => {
    const retrySpy = vi.spyOn(autoCheckinScheduler as any, "retryAccount")
    await expect(retryAutoCheckinAccount()).resolves.toEqual({
      success: false,
      error: "Missing accountId",
    })

    expect(retrySpy).not.toHaveBeenCalled()
  })

  it("should return account display data on autoCheckin:getAccountInfo", async () => {
    const displayData = { id: "account-1", name: "Test Account" }
    const displaySpy = vi
      .spyOn(autoCheckinScheduler as any, "getAccountDisplayData")
      .mockResolvedValueOnce(displayData)
    await expect(
      getAutoCheckinAccountInfo({ accountId: "account-1" }),
    ).resolves.toEqual({
      success: true,
      data: displayData,
    })

    expect(displaySpy).toHaveBeenCalledWith("account-1", {
      includeDisabled: false,
    })
  })

  it("should allow disabled account info lookup when includeDisabled is true", async () => {
    const displayData = { id: "disabled-1", name: "Disabled Account" }
    const displaySpy = vi
      .spyOn(autoCheckinScheduler as any, "getAccountDisplayData")
      .mockResolvedValueOnce(displayData)
    await expect(
      getAutoCheckinAccountInfo({
        accountId: "disabled-1",
        includeDisabled: true,
      }),
    ).resolves.toEqual({
      success: true,
      data: displayData,
    })

    expect(displaySpy).toHaveBeenCalledWith("disabled-1", {
      includeDisabled: true,
    })
  })

  it("should surface account info lookup failures back to the caller", async () => {
    const displaySpy = vi
      .spyOn(autoCheckinScheduler as any, "getAccountDisplayData")
      .mockRejectedValueOnce(new Error("lookup failed"))
    ;(
      getErrorMessage as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    )
    await expect(
      getAutoCheckinAccountInfo({ accountId: "account-1" }),
    ).rejects.toThrow("lookup failed")

    expect(displaySpy).toHaveBeenCalledWith("account-1", {
      includeDisabled: false,
    })
  })

  it("should reject account info requests without an accountId", async () => {
    const displaySpy = vi.spyOn(
      autoCheckinScheduler as any,
      "getAccountDisplayData",
    )
    await expect(getAutoCheckinAccountInfo({} as any)).resolves.toEqual({
      success: false,
      error: "Missing accountId",
    })

    expect(displaySpy).not.toHaveBeenCalled()
  })

  it("should update settings on autoCheckin:updateSettings", async () => {
    const updateSpy = vi
      .spyOn(autoCheckinScheduler as any, "updateSettings")
      .mockResolvedValueOnce(undefined)
    const settings = { globalEnabled: false }

    await expect(updateAutoCheckinSettings(settings)).resolves.toEqual({
      success: true,
    })

    expect(updateSpy).toHaveBeenCalledWith(settings)
  })

  it("normalizes a popup source at the pretrigger message boundary", async () => {
    const pretriggerSpy = vi
      .spyOn(autoCheckinScheduler as any, "pretriggerDailyOnUiOpen")
      .mockResolvedValueOnce({ started: false, eligible: false })
    await expect(
      pretriggerAutoCheckinDailyOnUiOpen({
        requestId: "req-1",
        protectionBypassExecution: uiOpenExecution(
          TEMP_WINDOW_REQUEST_SOURCES.Popup,
        ),
      }),
    ).resolves.toEqual({
      success: true,
      started: false,
      eligible: false,
    })

    expect(pretriggerSpy).toHaveBeenCalledWith({
      requestId: "req-1",
      dryRun: undefined,
      debug: undefined,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      protectionBypassExecution: uiOpenExecution(
        TEMP_WINDOW_REQUEST_SOURCES.Popup,
      ),
    })
  })

  it("normalizes an invalid pretrigger source to background", async () => {
    const pretriggerSpy = vi
      .spyOn(autoCheckinScheduler as any, "pretriggerDailyOnUiOpen")
      .mockResolvedValueOnce({ started: false, eligible: false })

    await pretriggerAutoCheckinDailyOnUiOpen({
      tempWindowRequestSource: "invalid-source",
      protectionBypassExecution: uiOpenExecution(
        TEMP_WINDOW_REQUEST_SOURCES.Background,
      ),
    } as any)

    expect(pretriggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      }),
    )
  })

  it("rejects a mismatched automatic feature at the UI-open boundary", async () => {
    const pretriggerSpy = vi.spyOn(
      autoCheckinScheduler as any,
      "pretriggerDailyOnUiOpen",
    )

    await expect(
      pretriggerAutoCheckinDailyOnUiOpen({
        protectionBypassExecution: ACCOUNT_REFRESH_EXECUTION,
      }),
    ).resolves.toEqual({
      success: false,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    })

    expect(pretriggerSpy).not.toHaveBeenCalled()
  })

  it("rejects automatic execution at the manual retry boundary", async () => {
    const retrySpy = vi.spyOn(autoCheckinScheduler as any, "retryAccount")

    await expect(
      retryAutoCheckinAccount(
        "account-1",
        TEMP_WINDOW_REQUEST_SOURCES.Popup,
        RETRY_EXECUTION,
      ),
    ).resolves.toEqual({
      success: false,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    })

    expect(retrySpy).not.toHaveBeenCalled()
  })

  it("derives the manual run source from the execution intent", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    vi.spyOn(autoCheckinScheduler as any, "scheduleNextRun").mockResolvedValue(
      undefined,
    )

    await runAutoCheckinNow({
      protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
    })

    expect(runSpy).toHaveBeenCalledWith({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: undefined,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Options,
      protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
    })
  })

  it("should reset lastDailyRunDay on autoCheckin:debugResetLastDailyRunDay", async () => {
    const debugSpy = vi
      .spyOn(autoCheckinScheduler as any, "debugResetLastDailyRunDay")
      .mockResolvedValueOnce(undefined)
    await expect(resetAutoCheckinLastDailyRunDay()).resolves.toEqual({
      success: true,
    })

    expect(debugSpy).toHaveBeenCalled()
  })

  it("should schedule the daily alarm for today on autoCheckin:debugScheduleDailyAlarmForToday", async () => {
    const debugSpy = vi
      .spyOn(autoCheckinScheduler as any, "debugScheduleDailyAlarmForToday")
      .mockResolvedValueOnce(123)
    await expect(
      scheduleAutoCheckinDailyAlarmForToday({
        minutesFromNow: 5,
      }),
    ).resolves.toEqual({
      success: true,
      scheduledTime: 123,
    })

    expect(debugSpy).toHaveBeenCalledWith({ minutesFromNow: 5 })
  })

  it("should catch errors and respond with error message", async () => {
    const error = new Error("boom")
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockRejectedValueOnce(error)
    ;(
      getErrorMessage as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    )
    await expect(
      runAutoCheckinNow({
        protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
      }),
    ).resolves.toEqual({
      success: false,
      error: "boom",
    })

    expect(runSpy).toHaveBeenCalled()
  })

  it("should still reschedule after a manual run failure", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockRejectedValueOnce(new Error("boom"))
    const scheduleSpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleNextRun")
      .mockResolvedValueOnce(undefined)
    ;(
      getErrorMessage as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    )
    await expect(
      runAutoCheckinNow({
        protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
      }),
    ).resolves.toEqual({
      success: false,
      error: "boom",
    })

    expect(runSpy).toHaveBeenCalled()
    expect(scheduleSpy).toHaveBeenCalledWith({ preserveExisting: true })
  })

  it("should keep the manual run response successful when post-run rescheduling fails", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    const scheduleSpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleNextRun")
      .mockRejectedValueOnce(new Error("reschedule failed"))
    await expect(
      runAutoCheckinNow({
        protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
      }),
    ).resolves.toEqual({ success: true })

    expect(runSpy).toHaveBeenCalledWith({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: undefined,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Options,
      protectionBypassExecution: OPTIONS_MANUAL_EXECUTION,
    })
    expect(scheduleSpy).toHaveBeenCalledWith({ preserveExisting: true })
  })
})
