// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { accountCheckinRunWorkflow } from "~/services/checkin/autoCheckin/execution/runAccountWorkflow"
import { autoCheckinAlarmSchedule } from "~/services/checkin/autoCheckin/scheduling/alarmSchedule"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  expectRecordedRetryDecision,
  mockedAccountStorage,
  mockedMethods,
  OPTIONS_MANUAL_EXECUTION,
  resolveProviderForTest,
  runnableCheckIn,
  SCHEDULED_EXECUTION,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("execution/runAccountWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it("reuses only valid daily alarms for the current schedule plan", () => {
    const triggerTime = new Date("2026-01-23T08:30:00")

    expect(
      (autoCheckinAlarmSchedule as any).isExistingDailyAlarmReusable(
        {
          scheduleMode: "random",
        },
        new Date("invalid"),
        null,
      ),
    ).toBe(false)

    expect(
      (autoCheckinAlarmSchedule as any).isExistingDailyAlarmReusable(
        {
          scheduleMode: "random",
        },
        new Date("2026-01-23T08:15:00"),
        {
          triggerTime,
          enforceTodayTarget: false,
        },
      ),
    ).toBe(true)

    expect(
      (autoCheckinAlarmSchedule as any).isExistingDailyAlarmReusable(
        {
          scheduleMode: "deterministic",
        },
        new Date("2026-01-22T08:15:00"),
        {
          triggerTime,
          enforceTodayTarget: true,
        },
      ),
    ).toBe(false)
  })

  it("keeps method_disabled on an actual skipped result", async () => {
    mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
      kind: "skipped",
      reason: "method_disabled",
    })

    await expect(
      accountCheckinRunWorkflow.runAccountCheckin(
        {
          id: "method-disabled-result",
          site_name: "Method Disabled",
          site_type: SITE_TYPES.NEW_API,
          disabled: false,
          account_info: {},
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        } as any,
        "Method Disabled",
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        SCHEDULED_EXECUTION,
      ),
    ).resolves.toMatchObject({
      result: {
        status: "skipped",
        reasonCode: "method_disabled",
        messageKey: "autoCheckin:skipReasons.method_disabled",
      },
    })
  })

  it.each([
    {
      name: "network loss",
      error: new TypeError("Failed to fetch"),
      expected: {
        status: "failed",
        reasonCode: "network_error",
        methodId: "new-api:daily-checkin",
        retryable: true,
      },
    },
    {
      name: "a bare HTTP 403",
      error: Object.assign(new Error("Request failed: 403"), {
        statusCode: 403,
      }),
      expected: {
        status: "uncertain",
        reasonCode: "upstream_error",
        methodId: "new-api:daily-checkin",
        retryable: true,
      },
    },
    {
      name: "an expired credential",
      error: Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
      expected: {
        status: "failed",
        reasonCode: "authentication_required",
        methodId: "new-api:daily-checkin",
        retryable: false,
      },
    },
  ])(
    "keeps a crashed execution from $name on the shared retry policy",
    async ({ error, expected }) => {
      mockedMethods.executeSelectedCheckIn.mockRejectedValueOnce(error)

      await expect(
        accountCheckinRunWorkflow.runAccountCheckin(
          {
            id: "crashed-execution",
            site_name: "Crashed Execution",
            site_type: SITE_TYPES.NEW_API,
            disabled: false,
            account_info: {},
            checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
          } as any,
          "Crashed Execution",
          TEMP_WINDOW_REQUEST_SOURCES.Background,
          SCHEDULED_EXECUTION,
        ),
      ).resolves.toMatchObject({ result: expected })
    },
  )

  it("revalidates the selected method through the account check-in owner", async () => {
    const account = {
      id: "revalidate-owner",
      site_name: "Revalidate Owner",
      site_type: SITE_TYPES.NEW_API,
      disabled: false,
      account_info: {},
      checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
    } as any
    const refreshedConfig = runnableCheckIn(true, SITE_TYPES.NEW_API)
    const preparedAccount = { ...account, checkIn: refreshedConfig }
    mockedAccountStorage.prepareAccountForSelectedCheckIn.mockResolvedValueOnce(
      preparedAccount,
    )
    mockedMethods.executeSelectedCheckIn.mockImplementationOnce(
      async ({ revalidateAccount }: any) => {
        await expect(revalidateAccount(refreshedConfig)).resolves.toBe(
          preparedAccount,
        )
        return { kind: "skipped", reason: "account_unavailable" }
      },
    )

    await expect(
      accountCheckinRunWorkflow.runAccountCheckin(
        account,
        account.site_name,
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        OPTIONS_MANUAL_EXECUTION,
      ),
    ).resolves.toMatchObject({
      result: { status: "skipped", reasonCode: "account_unavailable" },
    })
    expect(
      mockedAccountStorage.prepareAccountForSelectedCheckIn,
    ).toHaveBeenCalledWith(account.id, refreshedConfig, account)
  })

  it.each([
    {
      domainReason: "status_unavailable",
      resultReason: "status_unavailable",
    },
    {
      domainReason: "authentication_required",
      resultReason: "authentication_required",
    },
    {
      domainReason: "credentials_missing",
      resultReason: "credentials_missing",
    },
    {
      domainReason: "network_error",
      resultReason: "network_error",
    },
    {
      domainReason: "source_unavailable",
      resultReason: "source_unavailable",
    },
    {
      domainReason: "permission_denied",
      resultReason: "permission_denied",
    },
    {
      domainReason: "timeout",
      resultReason: "timeout",
    },
    {
      domainReason: "account_unavailable",
      resultReason: "account_unavailable",
    },
    {
      domainReason: "no_selected_method",
      resultReason: "no_selected_method",
    },
    {
      domainReason: "no_available_method",
      resultReason: "no_available_method",
    },
    {
      domainReason: "method_unavailable",
      resultReason: "method_unavailable",
    },
    {
      domainReason: "method_not_matched",
      resultReason: "method_not_matched",
    },
    {
      domainReason: "method_unsupported",
      resultReason: "method_unsupported",
    },
  ])(
    "maps $domainReason to the user-facing $resultReason result",
    async ({ domainReason, resultReason }) => {
      mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
        kind: "skipped",
        reason: domainReason,
      })

      await expect(
        accountCheckinRunWorkflow.runAccountCheckin(
          {
            id: domainReason,
            site_name: domainReason,
            site_type: SITE_TYPES.NEW_API,
            disabled: false,
            account_info: {},
            checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
          } as any,
          domainReason,
          TEMP_WINDOW_REQUEST_SOURCES.Background,
          SCHEDULED_EXECUTION,
        ),
      ).resolves.toMatchObject({
        result: {
          status: "skipped",
          reasonCode: resultReason,
          messageKey: `autoCheckin:skipReasons.${resultReason}`,
        },
      })
    },
  )

  it("handles provider-missing, failed, and thrown account check-in outcomes", async () => {
    resolveProviderForTest.mockReset()
    resolveProviderForTest.mockReturnValueOnce(null)

    await expect(
      accountCheckinRunWorkflow.runAccountCheckin(
        {
          id: "missing-provider",
          site_name: "Missing Provider",
          site_type: SITE_TYPES.NEW_API,
          disabled: false,
          account_info: {},
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        } as any,
        "Missing Provider",
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        SCHEDULED_EXECUTION,
      ),
    ).resolves.toMatchObject({
      result: {
        accountId: "missing-provider",
        status: "skipped",
        reasonCode: "no_provider",
      },
    })

    const failedProvider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn().mockResolvedValue({
        status: "failed",
        rawMessage: "provider failed",
      }),
    }
    resolveProviderForTest.mockReturnValueOnce(failedProvider as any)

    await expect(
      accountCheckinRunWorkflow.runAccountCheckin(
        {
          id: "provider-failed",
          site_name: "Provider Failed",
          site_type: SITE_TYPES.NEW_API,
          disabled: false,
          account_info: {},
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        } as any,
        "Provider Failed",
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        SCHEDULED_EXECUTION,
      ),
    ).resolves.toMatchObject({
      result: {
        accountId: "provider-failed",
        status: "failed",
        rawMessage: "provider failed",
      },
    })

    const throwingProvider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn().mockRejectedValue(new Error("provider exploded")),
    }
    resolveProviderForTest.mockReturnValueOnce(throwingProvider as any)

    await expect(
      accountCheckinRunWorkflow.runAccountCheckin(
        {
          id: "provider-threw",
          site_name: "Provider Threw",
          site_type: SITE_TYPES.NEW_API,
          disabled: false,
          account_info: {},
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        } as any,
        "Provider Threw",
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        SCHEDULED_EXECUTION,
      ),
    ).resolves.toMatchObject({
      result: {
        accountId: "provider-threw",
        status: "failed",
        rawMessage: expect.any(String),
      },
    })
    expect(throwingProvider.checkIn).toHaveBeenCalledTimes(1)
  })

  it("preserves a provider-classified network failure for user-facing results", async () => {
    mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
      kind: "executed",
      methodId: "new-api:daily-checkin",
      result: {
        status: "failed",
        messageKey: "autoCheckin:skipReasons.network_error",
        reasonCode: "network_error",
      },
    })

    await expect(
      accountCheckinRunWorkflow.runAccountCheckin(
        {
          id: "network-failure",
          site_name: "Network Failure",
          site_type: SITE_TYPES.NEW_API,
          disabled: false,
          account_info: {},
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        } as any,
        "Network Failure",
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        SCHEDULED_EXECUTION,
      ),
    ).resolves.toMatchObject({
      result: {
        status: "failed",
        reasonCode: "network_error",
        messageKey: "autoCheckin:skipReasons.network_error",
      },
    })
  })

  it("classifies an uncaught transport failure as network-related", async () => {
    mockedMethods.executeSelectedCheckIn.mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    )

    await expect(
      accountCheckinRunWorkflow.runAccountCheckin(
        {
          id: "uncaught-network-failure",
          site_name: "Uncaught Network Failure",
          site_type: SITE_TYPES.NEW_API,
          disabled: false,
          account_info: {},
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        } as any,
        "Uncaught Network Failure",
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        SCHEDULED_EXECUTION,
      ),
    ).resolves.toMatchObject({
      result: {
        status: "failed",
        reasonCode: "network_error",
        messageKey: "autoCheckin:skipReasons.network_error",
        rawMessage: undefined,
      },
    })
  })

  it("preserves an uncaught already-checked classification", async () => {
    mockedMethods.executeSelectedCheckIn.mockRejectedValueOnce(
      new Error("Already checked in today"),
    )

    await expect(
      accountCheckinRunWorkflow.runAccountCheckin(
        {
          id: "uncaught-already-checked",
          site_name: "Uncaught Already Checked",
          site_type: SITE_TYPES.NEW_API,
          disabled: false,
          account_info: {},
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        } as any,
        "Uncaught Already Checked",
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        SCHEDULED_EXECUTION,
      ),
    ).resolves.toMatchObject({
      result: {
        status: "already_checked",
        rawMessage: "Already checked in today",
      },
    })
  })

  it("retains one normalized source across account dispatch", async () => {
    const accounts = [
      {
        id: "source-a",
        site_name: "Source A",
        site_type: SITE_TYPES.NEW_API,
        disabled: false,
        account_info: {},
        checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
      },
      {
        id: "source-b",
        site_name: "Source B",
        site_type: SITE_TYPES.NEW_API,
        disabled: false,
        account_info: {},
        checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
      },
    ] as any[]
    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn().mockResolvedValue({ status: "success" }),
    }
    resolveProviderForTest.mockReturnValue(provider as any)

    await accountCheckinRunWorkflow.runAccountCheckins({
      accounts,
      accountDisplayNameById: new Map([
        ["source-a", "Source A"],
        ["source-b", "Source B"],
      ]),
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      protectionBypassExecution: SCHEDULED_EXECUTION,
      loginProviderOwners: new Map(),
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(2)
    for (const call of provider.checkIn.mock.calls) {
      expect(call[1]).toEqual({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution: SCHEDULED_EXECUTION,
      })
    }
  })

  it("uses the shared retry policy when batch account dispatch throws", async () => {
    const account = {
      id: "batch-network-failure",
      site_name: "Batch Network Failure",
      site_type: SITE_TYPES.NEW_API,
      site_url: "https://example.invalid",
      disabled: false,
      account_info: {},
      checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
    } as any
    const runAccountCheckin = vi.spyOn(
      accountCheckinRunWorkflow,
      "runAccountCheckin",
    )
    runAccountCheckin.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    try {
      const [outcome] = await accountCheckinRunWorkflow.runAccountCheckins({
        accounts: [account],
        accountDisplayNameById: new Map([[account.id, account.site_name]]),
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: SCHEDULED_EXECUTION,
        loginProviderOwners: new Map(),
      })
      expect(outcome!.result).toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
        methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
        retryable: true,
      })
      expectRecordedRetryDecision(outcome!.result)
    } finally {
      runAccountCheckin.mockRestore()
    }
  })

  it("marks accounts checked in for successful and already-checked outcomes", async () => {
    const successProvider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn().mockResolvedValueOnce({
        status: "success",
        rawMessage: "ok",
      }),
    }
    resolveProviderForTest.mockReturnValueOnce(successProvider as any)

    await expect(
      accountCheckinRunWorkflow.runAccountCheckin(
        {
          id: "success-account",
          site_name: "Success Account",
          site_type: SITE_TYPES.NEW_API,
          disabled: false,
          account_info: {},
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        } as any,
        "Success Account",
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        SCHEDULED_EXECUTION,
      ),
    ).resolves.toMatchObject({
      result: {
        accountId: "success-account",
        status: "success",
      },
    })

    const alreadyCheckedProvider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn().mockResolvedValueOnce({
        status: "already_checked",
        rawMessage: "already done",
      }),
    }
    resolveProviderForTest.mockReturnValueOnce(alreadyCheckedProvider as any)

    await expect(
      accountCheckinRunWorkflow.runAccountCheckin(
        {
          id: "already-checked-account",
          site_name: "Already Checked",
          site_type: SITE_TYPES.NEW_API,
          disabled: false,
          account_info: {},
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        } as any,
        "Already Checked",
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        SCHEDULED_EXECUTION,
      ),
    ).resolves.toMatchObject({
      result: {
        accountId: "already-checked-account",
        status: "already_checked",
      },
    })

    expect(
      mockedAccountStorage.markAccountAsSiteCheckedIn,
    ).toHaveBeenNthCalledWith(1, "success-account")
    expect(
      mockedAccountStorage.markAccountAsSiteCheckedIn,
    ).toHaveBeenNthCalledWith(2, "already-checked-account")
  })
})
