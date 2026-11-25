// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  manualExecution,
  mockedAccountStorage,
  mockedBrowserApi,
  mockedMethods,
  mockedUserPreferences,
  resolveProviderForTest,
  runCheckinsForTest,
  runnableCheckIn,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

describe("autoCheckinScheduler run-completed notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("emits run completion after preserving the popup source through post-checkin refresh", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    const callOrder: string[] = []

    mockedBrowserApi.sendRuntimeMessage.mockImplementation(async () => {
      callOrder.push("send")
      return undefined as any
    })

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        notifyUiOnCompletion: true,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const accountA: any = {
      id: "a",
      disabled: false,
      site_name: "SiteA",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user-a" },
      checkIn: runnableCheckIn(),
    }
    const accountB: any = {
      id: "b",
      disabled: false,
      site_name: "SiteB",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user-b" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA, accountB])
    mockedAccountStorage.refreshAccount.mockImplementation(
      async (id: string) => {
        callOrder.push("refresh")
        return {
          account: id === "a" ? accountA : accountB,
          refreshed: true,
        } as any
      },
    )

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async (account: any) => {
        return account.id === "a"
          ? { status: "success" }
          : { status: "failed", rawMessage: "boom" }
      }),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
    })

    expect(mockedAccountStorage.refreshAccount).toHaveBeenCalledWith(
      "a",
      true,
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution: manualExecution(
          TEMP_WINDOW_REQUEST_SOURCES.Popup,
        ),
      },
    )
    expect(
      mockedAccountStorage.refreshAccount.mock.calls[0]?.[2]
        ?.protectionBypassExecution,
    ).toEqual(manualExecution(TEMP_WINDOW_REQUEST_SOURCES.Popup))
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "manual",
        updatedAccountIds: ["a"],
        timestamp: expect.any(Number),
      }),
      { maxAttempts: 1 },
    )
    expect(callOrder).toEqual(["refresh", "send"])

    vi.useRealTimers()
  })

  it("still emits autoCheckin:runCompleted when post-checkin refresh fails", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    const callOrder: string[] = []

    mockedBrowserApi.sendRuntimeMessage.mockImplementation(async () => {
      callOrder.push("send")
      return undefined as any
    })

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        notifyUiOnCompletion: true,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const accountA: any = {
      id: "a",
      disabled: false,
      site_name: "SiteA",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user-a" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA])
    mockedAccountStorage.refreshAccount.mockImplementation(async () => {
      callOrder.push("refresh")
      throw new Error("refresh boom")
    })

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
    })

    expect(mockedAccountStorage.refreshAccount).toHaveBeenCalledWith(
      "a",
      true,
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: manualExecution(
          TEMP_WINDOW_REQUEST_SOURCES.Background,
        ),
      },
    )
    expect(
      mockedAccountStorage.refreshAccount.mock.calls[0]?.[2]
        ?.protectionBypassExecution,
    ).toEqual(manualExecution(TEMP_WINDOW_REQUEST_SOURCES.Background))
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "manual",
        updatedAccountIds: ["a"],
        timestamp: expect.any(Number),
      }),
      { maxAttempts: 1 },
    )
    expect(callOrder).toEqual(["refresh", "send"])

    vi.useRealTimers()
  })

  it("does not emit autoCheckin:runCompleted when notifyUiOnCompletion is disabled", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedBrowserApi.sendRuntimeMessage.mockResolvedValue(undefined as any)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        notifyUiOnCompletion: false,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const accountA: any = {
      id: "a",
      disabled: false,
      site_name: "SiteA",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user-a" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA])
    mockedAccountStorage.refreshAccount.mockResolvedValue({
      account: accountA,
      refreshed: true,
    } as any)

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
    })

    expect(mockedAccountStorage.refreshAccount).toHaveBeenCalledWith(
      "a",
      true,
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: manualExecution(
          TEMP_WINDOW_REQUEST_SOURCES.Background,
        ),
      },
    )
    expect(mockedBrowserApi.sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
      }),
      expect.anything(),
    )

    vi.useRealTimers()
  })

  it("suppresses manual-shaped completion notifications for a scoped scheduled run", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 13, 0, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        notifyUiOnCompletion: true,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })
    const account: any = {
      id: "chatflows-reset",
      disabled: false,
      site_name: "ChatflowsAI",
      site_type: SITE_TYPES.SUB2API,
      account_info: { username: "chatflows-user" },
      checkIn: buildCheckInConfig({
        automaticExecutionEnabled: true,
        selection: {
          mode: "manual",
          methodId: AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn,
        },
        methodKnowledge: {
          methods: {
            [AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn]: {
              detection: {
                outcome: "matched",
                evidence: { source: "probe", observedAt: Date.now() },
              },
            },
          },
        },
      }),
    }
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    mockedAccountStorage.refreshAccount.mockResolvedValue({
      account,
      refreshed: true,
    } as any)
    resolveProviderForTest.mockReturnValue({
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    })

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: [account.id],
      scheduledAutomaticExecution: true,
      notifyUiOnCompletion: false,
    })

    expect(mockedAccountStorage.getAllAccounts).toHaveBeenCalledOnce()
    expect(mockedMethods.executeSelectedCheckIn).toHaveBeenCalledOnce()
    expect(mockedBrowserApi.sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
      }),
      expect.anything(),
    )
    expect(schedulerTestState.storedStatus.lastDailyRunDay).toBeUndefined()

    vi.useRealTimers()
  })
})
