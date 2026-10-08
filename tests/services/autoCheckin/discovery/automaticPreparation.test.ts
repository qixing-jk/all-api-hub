// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { prepareAutomaticCheckIn } from "~/services/checkin/autoCheckin/discovery/automaticDiscovery"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import {
  mockedAccountStorage,
  mockedMethods,
  mockedUserPreferences,
  noSelectedCheckIn,
  resolveProviderForTest,
  runCheckinsForTest,
  SCHEDULED_EXECUTION,
  schedulerTestState,
  siteTypeObservationMocks,
  starPromotionMocks,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

describe("daily automatic check-in preparation", () => {
  const createAccount = () => ({
    id: "rediscovery-account",
    site_name: "Rediscovery site",
    site_type: SITE_TYPES.SUB2API,
    site_url: "https://rediscovery.example",
    account_info: { id: "1", username: "test-user" },
    disabled: false,
    checkIn: buildCheckInConfig({
      automaticExecutionEnabled: true,
      selection: { mode: "automatic", methodId: "sub2api-pro:daily-checkin" },
      methodKnowledge: {
        methods: {
          "sub2api-pro:daily-checkin": {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 100 },
            },
          },
        },
      },
    }),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    starPromotionMocks.addCheckinSuccesses.mockResolvedValue(undefined)
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: { ...DEFAULT_PREFERENCES.autoCheckin, globalEnabled: true },
    })
    mockedAccountStorage.markAccountAsSiteCheckedIn.mockResolvedValue(true)
    mockedAccountStorage.refreshAccount.mockResolvedValue({ refreshed: false })
    resolveProviderForTest.mockReturnValue({
      getReadiness: () => ({ ready: true }),
      checkIn: vi.fn(async () => ({ status: "success" })),
    })
  })

  it("leaves the site type observation for a failure the stored type explains, under the run's bypass context", async () => {
    const account = createAccount()
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
      kind: "skipped",
      reason: "status_unavailable",
    })

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(
      siteTypeObservationMocks.recordSiteTypeObservationForResult,
    ).toHaveBeenCalledWith(
      account,
      expect.objectContaining({ reasonCode: "status_unavailable" }),
      { protectionBypassExecution: SCHEDULED_EXECUTION },
    )
    expect(
      schedulerTestState.storedStatus.perAccount[account.id],
    ).toMatchObject({
      status: "skipped",
      reasonCode: "status_unavailable",
    })
  })

  it("lets an unselected automatic account discover a method before readiness filtering", async () => {
    const account = createAccount()
    const readyConfig = account.checkIn
    account.checkIn = noSelectedCheckIn()
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    vi.mocked(prepareAutomaticCheckIn).mockImplementation(
      async ({ account: current, context, isAutomaticExecutionEnabled }) => {
        expect(await isAutomaticExecutionEnabled()).toBe(true)
        expect(context.protectionBypassExecution).toEqual(SCHEDULED_EXECUTION)
        return {
          account: { ...current, checkIn: readyConfig },
          discovered: true,
        }
      },
    )

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(mockedMethods.executeSelectedCheckIn).toHaveBeenCalledTimes(1)
    expect(
      atIndex(mockedMethods.executeSelectedCheckIn.mock.calls, 0)[0].account
        .checkIn.selection.methodId,
    ).toBe("sub2api-pro:daily-checkin")
    expect(schedulerTestState.storedStatus.perAccount[account.id].status).toBe(
      "success",
    )
    expect(schedulerTestState.storedStatus.accountsSnapshot[0]).toMatchObject({
      detectionEnabled: true,
      providerAvailable: true,
    })
  })

  it("waits for successful check-ins to persist promotion progress", async () => {
    const account = createAccount()
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    let finishProgressWrite: (() => void) | undefined
    starPromotionMocks.addCheckinSuccesses.mockReturnValue(
      new Promise<void>((resolve) => {
        finishProgressWrite = resolve
      }),
    )

    let runSettled = false
    const runPromise = runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
    }).then(() => {
      runSettled = true
    })

    await vi.waitFor(() => {
      expect(starPromotionMocks.addCheckinSuccesses).toHaveBeenCalledWith(1)
    })
    expect(runSettled).toBe(false)

    finishProgressWrite?.()
    await runPromise
    expect(runSettled).toBe(true)
  })

  it("keeps a successful check-in successful when promotion progress cannot persist", async () => {
    const account = createAccount()
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    starPromotionMocks.addCheckinSuccesses.mockRejectedValue(
      new Error("promotion storage unavailable"),
    )

    await expect(
      runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY }),
    ).resolves.toBeUndefined()
    expect(schedulerTestState.storedStatus.perAccount[account.id].status).toBe(
      "success",
    )
  })

  it("persists the reward a successful check-in reported", async () => {
    const account = createAccount()
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
      kind: "executed",
      methodId: "sub2api-pro:daily-checkin",
      result: {
        status: "success",
        messageKey: "autoCheckin:providerFallback.checkinSuccessful",
        reward: { quota: 250_000 },
      },
      retryable: false,
    })

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(
      schedulerTestState.storedStatus.perAccount[account.id],
    ).toMatchObject({
      status: "success",
      reward: { quota: 250_000 },
    })
  })

  it("persists a success without a reward when the method reports no amount", async () => {
    const account = createAccount()
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
      kind: "executed",
      methodId: "sub2api-pro:daily-checkin",
      result: {
        status: "success",
        messageKey: "autoCheckin:providerFallback.checkinSuccessful",
      },
      retryable: false,
    })

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(schedulerTestState.storedStatus.perAccount[account.id].status).toBe(
      "success",
    )
    expect(
      schedulerTestState.storedStatus.perAccount[account.id].reward,
    ).toBeUndefined()
  })

  it.each(["manual", "globally disabled"])(
    "does not run automatic discovery for a %s run",
    async (mode) => {
      const account = createAccount()
      account.checkIn = noSelectedCheckIn()
      mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
      if (mode === "globally disabled") {
        mockedUserPreferences.getPreferences.mockResolvedValue({
          autoCheckin: {
            ...DEFAULT_PREFERENCES.autoCheckin,
            globalEnabled: false,
          },
        })
      }

      await runCheckinsForTest({
        runType:
          mode === "manual"
            ? AUTO_CHECKIN_RUN_TYPE.MANUAL
            : AUTO_CHECKIN_RUN_TYPE.DAILY,
      })

      expect(prepareAutomaticCheckIn).not.toHaveBeenCalled()
      expect(mockedMethods.executeSelectedCheckIn).not.toHaveBeenCalled()
    },
  )

  it("keeps a preparation storage failure out of execution", async () => {
    const account = createAccount()
    account.checkIn = noSelectedCheckIn()
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    vi.mocked(prepareAutomaticCheckIn).mockResolvedValue({
      account: null,
      discovered: false,
    })

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(mockedMethods.executeSelectedCheckIn).not.toHaveBeenCalled()
    expect(
      schedulerTestState.storedStatus.perAccount[account.id],
    ).toMatchObject({
      status: "skipped",
      reasonCode: "account_unavailable",
    })
  })

  it("rechecks the global switch after preparation", async () => {
    const account = createAccount()
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    vi.mocked(prepareAutomaticCheckIn).mockImplementation(
      async ({ account: current }) => {
        mockedUserPreferences.getPreferences.mockResolvedValue({
          autoCheckin: {
            ...DEFAULT_PREFERENCES.autoCheckin,
            globalEnabled: false,
          },
        })
        return { account: current, discovered: true }
      },
    )

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(mockedMethods.executeSelectedCheckIn).not.toHaveBeenCalled()
    expect(
      schedulerTestState.storedStatus.perAccount[account.id],
    ).toMatchObject({
      status: "skipped",
      reasonCode: "auto_checkin_disabled",
    })
    expect(account.checkIn.automaticExecutionEnabled).toBe(true)
  })

  it("recovers once when the selected method is rejected before POST", async () => {
    const account = createAccount()
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    const unsupported = structuredClone(account)
    unsupported.checkIn.methodKnowledge.methods[
      "sub2api-pro:daily-checkin"
    ]!.detection = {
      outcome: "unsupported",
      evidence: { source: "probe", observedAt: Date.now() },
    }
    mockedAccountStorage.getAccountById.mockResolvedValue(unsupported)
    mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
      kind: "skipped",
      reason: "method_unsupported",
    })
    vi.mocked(prepareAutomaticCheckIn).mockImplementation(
      async ({ account: current, isAutomaticExecutionEnabled }) => {
        expect(await isAutomaticExecutionEnabled()).toBe(true)
        if (
          current.checkIn.methodKnowledge.methods["sub2api-pro:daily-checkin"]
            ?.detection.outcome !== "unsupported"
        ) {
          return { account: current, discovered: false }
        }
        return {
          discovered: true,
          account: {
            ...current,
            checkIn: {
              ...current.checkIn,
              selection: {
                mode: "automatic",
                methodId: "genius-programmer:daily-checkin",
              },
              methodKnowledge: {
                ...current.checkIn.methodKnowledge,
                methods: {
                  ...current.checkIn.methodKnowledge.methods,
                  "genius-programmer:daily-checkin": {
                    detection: {
                      outcome: "matched",
                      evidence: { source: "probe", observedAt: Date.now() },
                    },
                  },
                },
              },
            },
          },
        }
      },
    )

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(prepareAutomaticCheckIn).toHaveBeenCalledTimes(2)
    expect(mockedMethods.executeSelectedCheckIn).toHaveBeenCalledTimes(2)
    expect(
      atIndex(mockedMethods.executeSelectedCheckIn.mock.calls, 1)[0].account
        .checkIn.selection.methodId,
    ).toBe("genius-programmer:daily-checkin")
    expect(schedulerTestState.storedStatus.perAccount[account.id].status).toBe(
      "success",
    )
  })

  it("does not retry execution when recovery discovery is discarded", async () => {
    const account = createAccount()
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    mockedAccountStorage.getAccountById.mockResolvedValue(account)
    mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
      kind: "skipped",
      reason: "method_unsupported",
    })
    vi.mocked(prepareAutomaticCheckIn).mockImplementation(
      async ({ account }) => ({
        account,
        discovered: false,
      }),
    )

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(prepareAutomaticCheckIn).toHaveBeenCalledTimes(2)
    expect(mockedMethods.executeSelectedCheckIn).toHaveBeenCalledTimes(1)
    expect(
      schedulerTestState.storedStatus.perAccount[account.id],
    ).toMatchObject({
      status: "skipped",
      reasonCode: "method_unsupported",
    })
  })

  it.each(["deleted account", "failed preparation"])(
    "does not execute a replacement after recovery finds a %s",
    async (failure) => {
      const account = createAccount()
      mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
      mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
        kind: "skipped",
        reason: "method_unsupported",
      })
      mockedAccountStorage.getAccountById.mockResolvedValue(
        failure === "deleted account" ? null : account,
      )
      vi.mocked(prepareAutomaticCheckIn)
        .mockImplementationOnce(async ({ account }) => ({
          account,
          discovered: false,
        }))
        .mockResolvedValue({ account: null, discovered: false })

      await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

      expect(mockedMethods.executeSelectedCheckIn).toHaveBeenCalledTimes(1)
      expect(
        schedulerTestState.storedStatus.perAccount[account.id],
      ).toMatchObject({
        status: "failed",
        reasonCode: "account_unavailable",
        retryable: false,
      })
    },
  )

  it.each([
    {
      name: "an uncertain mutation",
      execution: {
        kind: "executed",
        methodId: "sub2api-pro:daily-checkin",
        result: { status: "uncertain", reconciliation: "unknown" },
        retryable: false,
      },
    },
    {
      name: "a failed mutation",
      execution: {
        kind: "executed",
        methodId: "sub2api-pro:daily-checkin",
        result: { status: "failed", reasonCode: "method_unsupported" },
        retryable: false,
      },
    },
    {
      name: "an unpersisted unsupported result",
      execution: {
        kind: "blocked",
        reason: "account_unavailable",
        retryable: false,
      },
    },
    {
      name: "a network failure",
      execution: { kind: "skipped", reason: "network_error" },
    },
    {
      name: "an expired login",
      execution: { kind: "skipped", reason: "authentication_required" },
    },
  ])("does not switch methods after $name", async ({ execution }) => {
    const account = createAccount()
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    mockedMethods.executeSelectedCheckIn.mockResolvedValue(execution)

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(prepareAutomaticCheckIn).toHaveBeenCalledTimes(1)
    expect(mockedMethods.executeSelectedCheckIn).toHaveBeenCalledTimes(1)
  })

  it("stops before mutation when the global switch changes during status readback", async () => {
    const account = createAccount()
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    mockedMethods.executeSelectedCheckIn.mockImplementation(
      async ({ isAutomaticExecutionEnabled }) => {
        mockedUserPreferences.getPreferences.mockResolvedValue({
          autoCheckin: {
            ...DEFAULT_PREFERENCES.autoCheckin,
            globalEnabled: false,
          },
        })
        expect(await isAutomaticExecutionEnabled()).toBe(false)
        return {
          kind: "skipped",
          reason: "global_automatic_execution_disabled",
        }
      },
    )

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(
      schedulerTestState.storedStatus.perAccount[account.id],
    ).toMatchObject({
      status: "skipped",
      reasonCode: "auto_checkin_disabled",
    })
  })
})
