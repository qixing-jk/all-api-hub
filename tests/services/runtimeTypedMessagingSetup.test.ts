import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

const MANUAL_CHECKIN_EXECUTION = userCommandExecution(
  PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
)

const RETRY_CHECKIN_EXECUTION = userCommandExecution(
  PROTECTION_BYPASS_USER_COMMANDS.RetryCheckinAccount,
)

const UI_OPEN_CHECKIN_EXECUTION = {
  version: 1,
  kind: "automatic",
  feature: PROTECTION_BYPASS_FEATURES.Checkin,
  trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
  surface: TEMP_WINDOW_REQUEST_SOURCES.Options,
} as const

const ACCOUNT_REFRESH_EXECUTION = userCommandExecution(
  PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
)

const MODEL_SYNC_EXECUTION = userCommandExecution(
  PROTECTION_BYPASS_USER_COMMANDS.VerifyProtection,
)

const OPTIONS_SENDER = {
  url: "chrome-extension://test/options.html",
} as const

const UI_LDOH_SITE_DETECTION_EXECUTION = {
  version: 1,
  kind: "automatic",
  feature: PROTECTION_BYPASS_FEATURES.SiteDetection,
  trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
  surface: TEMP_WINDOW_REQUEST_SOURCES.Popup,
} as const

const OPTIONS_LDOH_SITE_DETECTION_EXECUTION = {
  ...UI_LDOH_SITE_DETECTION_EXECUTION,
  surface: TEMP_WINDOW_REQUEST_SOURCES.Options,
} as const

type RuntimeMessageHandler = (input?: {
  data?: unknown
  sender?: { url?: string }
}) => Promise<unknown>
type OnMessageMock = ReturnType<
  typeof vi.fn<(type: string, handler: RuntimeMessageHandler) => () => void>
>

function getRegisteredHandler(mock: OnMessageMock, type: string) {
  const handler = mock.mock.calls.find(([registeredType]) => {
    return registeredType === type
  })?.[1]

  expect(handler).toBeTypeOf("function")
  return handler!
}

describe("typed runtime messaging setup", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("registers model sync typed listeners once and wraps handler errors", async () => {
    const onModelSyncMessage: OnMessageMock = vi.fn(() => vi.fn())
    const getPreferences = vi.fn().mockRejectedValue(new Error("boom"))

    vi.doMock("~/services/models/modelSync/messaging", () => ({
      onModelSyncMessage,
    }))
    vi.doMock("~/services/models/modelSync/storage", () => ({
      managedSiteModelSyncStorage: {
        getChannelUpstreamModelOptions: vi.fn(),
        getLastExecution: vi.fn(),
        getPreferences,
        saveChannelUpstreamModelOptions: vi.fn(),
        saveLastExecution: vi.fn(),
      },
    }))
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: { managedSiteModelSync: {} },
      userPreferences: { getPreferences: vi.fn(), savePreferences: vi.fn() },
    }))
    vi.doMock("~/utils/i18n/core", () => ({
      t: vi.fn((key: string) =>
        key === "settings:messages.runtimeRequestFailed"
          ? "Runtime request failed"
          : key,
      ),
    }))
    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()
      return {
        ...actual,
        clearAlarm: vi.fn(),
        createAlarm: vi.fn(),
        getAlarm: vi.fn(),
        hasAlarmsAPI: vi.fn(),
        onAlarm: vi.fn(),
      }
    })

    const scheduler = await import("~/services/models/modelSync/scheduler")

    scheduler.setupManagedSiteModelSyncMessagingListeners()
    scheduler.setupManagedSiteModelSyncMessagingListeners()

    expect(onModelSyncMessage).toHaveBeenCalledTimes(10)
    const getPreferencesHandler = onModelSyncMessage.mock.calls.find(
      ([type]) => type === "modelSync:getPreferences",
    )?.[1]
    expect(getPreferencesHandler).toBeTypeOf("function")
    await expect(getPreferencesHandler!()).resolves.toEqual({
      success: false,
      error: "boom",
    })
  })

  it("routes model sync typed listeners through each scheduler action", async () => {
    const onModelSyncMessage: OnMessageMock = vi.fn(() => vi.fn())
    const getAlarm = vi.fn().mockResolvedValue({
      scheduledTime: new Date("2026-01-01T00:00:00.000Z").getTime(),
      periodInMinutes: 30,
    })
    const executeSync = vi.fn().mockResolvedValue({
      items: [],
      statistics: { total: 0 },
    })
    const executeFailedOnly = vi.fn().mockResolvedValue({
      items: [],
      statistics: { total: 0 },
    })
    const getProgress = vi.fn().mockReturnValue({ isRunning: true })
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const listChannels = vi.fn().mockResolvedValue({
      items: [{ id: 1, name: "Channel" }],
      total: 1,
      type_counts: {},
    })
    const getLastExecution = vi.fn().mockResolvedValue({
      items: [{ channelId: 1 }],
      statistics: { total: 1 },
    })
    const getPreferences = vi.fn().mockResolvedValue({ enabled: true })
    const getChannelUpstreamModelOptions = vi.fn().mockResolvedValue(["gpt-4o"])

    vi.doMock("~/services/models/modelSync/messaging", () => ({
      onModelSyncMessage,
    }))
    vi.doMock("~/services/models/modelSync/storage", () => ({
      managedSiteModelSyncStorage: {
        getChannelUpstreamModelOptions,
        getLastExecution,
        getPreferences,
        saveChannelUpstreamModelOptions: vi.fn(),
        saveLastExecution: vi.fn(),
      },
    }))
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: { managedSiteModelSync: {} },
      userPreferences: { getPreferences: vi.fn(), savePreferences: vi.fn() },
    }))
    vi.doMock("~/utils/i18n/core", () => ({
      t: vi.fn((key: string) =>
        key === "settings:messages.runtimeRequestFailed"
          ? "Runtime request failed"
          : key,
      ),
    }))
    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()
      return {
        ...actual,
        clearAlarm: vi.fn(),
        createAlarm: vi.fn(),
        getAlarm,
        hasAlarmsAPI: vi.fn(),
        onAlarm: vi.fn(),
      }
    })

    const scheduler = await import("~/services/models/modelSync/scheduler")
    vi.spyOn(scheduler.modelSyncScheduler, "executeSync").mockImplementation(
      executeSync,
    )
    vi.spyOn(
      scheduler.modelSyncScheduler,
      "executeFailedOnly",
    ).mockImplementation(executeFailedOnly)
    vi.spyOn(scheduler.modelSyncScheduler, "getProgress").mockImplementation(
      getProgress,
    )
    vi.spyOn(scheduler.modelSyncScheduler, "updateSettings").mockImplementation(
      updateSettings,
    )
    vi.spyOn(scheduler.modelSyncScheduler, "listChannels").mockImplementation(
      listChannels,
    )

    scheduler.setupManagedSiteModelSyncMessagingListeners()

    await expect(
      getRegisteredHandler(onModelSyncMessage, "modelSync:getNextRun")(),
    ).resolves.toEqual({
      success: true,
      data: {
        nextScheduledAt: "2026-01-01T00:00:00.000Z",
        periodInMinutes: 30,
      },
    })
    await expect(
      getRegisteredHandler(
        onModelSyncMessage,
        "modelSync:triggerAll",
      )({
        data: { protectionBypassExecution: MODEL_SYNC_EXECUTION },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: true,
      data: { items: [], statistics: { total: 0 } },
    })
    await expect(
      getRegisteredHandler(
        onModelSyncMessage,
        "modelSync:triggerSelected",
      )({
        data: {
          channelIds: [1, 2],
          protectionBypassExecution: MODEL_SYNC_EXECUTION,
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: true,
      data: { items: [], statistics: { total: 0 } },
    })
    await expect(
      getRegisteredHandler(
        onModelSyncMessage,
        "modelSync:triggerSelected",
      )({
        data: {
          channelIds: [],
          protectionBypassExecution: MODEL_SYNC_EXECUTION,
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: false,
      error: "channelIds must be a non-empty array for selected sync",
    })
    await expect(
      getRegisteredHandler(
        onModelSyncMessage,
        "modelSync:triggerFailedOnly",
      )({
        data: { protectionBypassExecution: MODEL_SYNC_EXECUTION },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: true,
      data: { items: [], statistics: { total: 0 } },
    })
    await expect(
      getRegisteredHandler(onModelSyncMessage, "modelSync:getLastExecution")(),
    ).resolves.toEqual({
      success: true,
      data: { items: [{ channelId: 1 }], statistics: { total: 1 } },
    })
    await expect(
      getRegisteredHandler(onModelSyncMessage, "modelSync:getProgress")(),
    ).resolves.toEqual({
      success: true,
      data: { isRunning: true },
    })
    await expect(
      getRegisteredHandler(
        onModelSyncMessage,
        "modelSync:updateSettings",
      )({
        data: { settings: { enableSync: false } },
      }),
    ).resolves.toEqual({ success: true })
    await expect(
      getRegisteredHandler(onModelSyncMessage, "modelSync:getPreferences")(),
    ).resolves.toEqual({
      success: true,
      data: { enabled: true },
    })
    await expect(
      getRegisteredHandler(
        onModelSyncMessage,
        "modelSync:getChannelUpstreamModelOptions",
      )(),
    ).resolves.toEqual({
      success: true,
      data: ["gpt-4o"],
    })
    await expect(
      getRegisteredHandler(onModelSyncMessage, "modelSync:listChannels")(),
    ).resolves.toEqual({
      success: true,
      data: {
        items: [{ id: 1, name: "Channel" }],
        total: 1,
        type_counts: {},
      },
    })

    expect(executeSync).toHaveBeenNthCalledWith(
      1,
      undefined,
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
      MODEL_SYNC_EXECUTION,
    )
    expect(executeSync).toHaveBeenNthCalledWith(
      2,
      [1, 2],
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
      MODEL_SYNC_EXECUTION,
    )
    expect(executeFailedOnly).toHaveBeenCalledWith(MODEL_SYNC_EXECUTION)
    expect(updateSettings).toHaveBeenCalledWith({ enableSync: false })
  })

  it("rejects model sync messages without user-command intent", async () => {
    const onModelSyncMessage: OnMessageMock = vi.fn(() => vi.fn())
    const executeSync = vi.fn()

    vi.doMock("~/services/models/modelSync/messaging", () => ({
      onModelSyncMessage,
    }))

    const scheduler = await import("~/services/models/modelSync/scheduler")
    vi.spyOn(scheduler.modelSyncScheduler, "executeSync").mockImplementation(
      executeSync,
    )
    scheduler.setupManagedSiteModelSyncMessagingListeners()

    await expect(
      getRegisteredHandler(
        onModelSyncMessage,
        "modelSync:triggerAll",
      )({
        data: {
          protectionBypassExecution: {
            version: 1,
            kind: "automatic",
            feature: PROTECTION_BYPASS_FEATURES.SessionResync,
            trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
            surface: TEMP_WINDOW_REQUEST_SOURCES.Options,
          },
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid protection bypass execution",
    })
    expect(executeSync).not.toHaveBeenCalled()
  })

  it("wraps every model sync typed listener failure with its error message", async () => {
    const onModelSyncMessage: OnMessageMock = vi.fn(() => vi.fn())
    vi.doMock("~/services/models/modelSync/messaging", () => ({
      onModelSyncMessage,
    }))
    vi.doMock("~/services/models/modelSync/storage", () => ({
      managedSiteModelSyncStorage: {
        getChannelUpstreamModelOptions: vi
          .fn()
          .mockRejectedValue(new Error("upstream options failed")),
        getLastExecution: vi
          .fn()
          .mockRejectedValue(new Error("last execution failed")),
        getPreferences: vi.fn().mockRejectedValue(new Error("prefs failed")),
        saveChannelUpstreamModelOptions: vi.fn(),
        saveLastExecution: vi.fn(),
      },
    }))
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: { managedSiteModelSync: {} },
      userPreferences: { getPreferences: vi.fn(), savePreferences: vi.fn() },
    }))
    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()
      return {
        ...actual,
        clearAlarm: vi.fn(),
        createAlarm: vi.fn(),
        getAlarm: vi.fn().mockRejectedValue(new Error("alarm failed")),
        hasAlarmsAPI: vi.fn(),
        onAlarm: vi.fn(),
      }
    })

    const scheduler = await import("~/services/models/modelSync/scheduler")
    vi.spyOn(scheduler.modelSyncScheduler, "executeSync").mockRejectedValue(
      new Error("sync failed"),
    )
    vi.spyOn(
      scheduler.modelSyncScheduler,
      "executeFailedOnly",
    ).mockRejectedValue(new Error("failed-only sync failed"))
    vi.spyOn(scheduler.modelSyncScheduler, "getProgress").mockImplementation(
      () => {
        throw new Error("progress failed")
      },
    )
    vi.spyOn(scheduler.modelSyncScheduler, "updateSettings").mockRejectedValue(
      new Error("update failed"),
    )
    vi.spyOn(scheduler.modelSyncScheduler, "listChannels").mockRejectedValue(
      new Error("list failed"),
    )

    scheduler.setupManagedSiteModelSyncMessagingListeners()

    for (const [type, input, error] of [
      ["modelSync:getNextRun", undefined, "alarm failed"],
      [
        "modelSync:triggerAll",
        {
          data: { protectionBypassExecution: MODEL_SYNC_EXECUTION },
          sender: OPTIONS_SENDER,
        },
        "sync failed",
      ],
      [
        "modelSync:triggerSelected",
        {
          data: {
            channelIds: [1],
            protectionBypassExecution: MODEL_SYNC_EXECUTION,
          },
          sender: OPTIONS_SENDER,
        },
        "sync failed",
      ],
      [
        "modelSync:triggerFailedOnly",
        {
          data: { protectionBypassExecution: MODEL_SYNC_EXECUTION },
          sender: OPTIONS_SENDER,
        },
        "failed-only sync failed",
      ],
      ["modelSync:getLastExecution", undefined, "last execution failed"],
      ["modelSync:getProgress", undefined, "progress failed"],
      ["modelSync:updateSettings", { data: { settings: {} } }, "update failed"],
      ["modelSync:getPreferences", undefined, "prefs failed"],
      [
        "modelSync:getChannelUpstreamModelOptions",
        undefined,
        "upstream options failed",
      ],
      ["modelSync:listChannels", undefined, "list failed"],
    ] as const) {
      await expect(
        getRegisteredHandler(onModelSyncMessage, type)(input),
      ).resolves.toEqual({
        success: false,
        error,
      })
    }
  })

  it("registers account key repair typed listeners once and wraps handler errors", async () => {
    const onAccountKeyRepairMessage: OnMessageMock = vi.fn(() => vi.fn())
    const storageGet = vi.fn().mockRejectedValue(new Error("repair failed"))
    const getAllAccounts = vi.fn().mockResolvedValue([])
    const convertToDisplayData = vi.fn().mockReturnValue([])

    vi.doMock(
      "~/services/accounts/accountKeyAutoProvisioning/messaging",
      () => ({
        AccountKeyRepairMessageTypes: {
          Start: "accountKeyRepair:start",
          Cancel: "accountKeyRepair:cancel",
          GetProgress: "accountKeyRepair:getProgress",
          DeleteInvalidTokens: "accountKeyRepair:deleteInvalidTokens",
        },
        onAccountKeyRepairMessage,
      }),
    )
    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        getAllAccounts,
        convertToDisplayData,
      },
    }))
    vi.doMock("@plasmohq/storage", () => ({
      Storage: class {
        get = storageGet
        set = vi.fn()
      },
    }))

    const repair = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    repair.setupAccountKeyRepairMessagingListeners()
    repair.setupAccountKeyRepairMessagingListeners()

    expect(onAccountKeyRepairMessage).toHaveBeenCalledTimes(4)
    const getProgressHandler = onAccountKeyRepairMessage.mock.calls.find(
      ([type]) => type === "accountKeyRepair:getProgress",
    )?.[1]
    expect(getProgressHandler).toBeTypeOf("function")
    await expect(getProgressHandler!()).resolves.toEqual({
      success: false,
      error: "repair failed",
    })

    const cancelHandler = getRegisteredHandler(
      onAccountKeyRepairMessage,
      "accountKeyRepair:cancel",
    )
    await expect(cancelHandler()).resolves.toEqual({
      success: false,
      error: "repair failed",
    })

    const deleteHandler = getRegisteredHandler(
      onAccountKeyRepairMessage,
      "accountKeyRepair:deleteInvalidTokens",
    )
    await expect(deleteHandler({ data: { tokens: [] } })).resolves.toEqual({
      success: false,
      error: "repair failed",
    })
    expect(getAllAccounts).toHaveBeenCalledTimes(1)
    expect(convertToDisplayData).toHaveBeenCalledWith([], [])
  })

  it("routes WebDAV auto-sync typed listeners through runtime resolvers", async () => {
    const onWebdavAutoSyncMessage: OnMessageMock = vi.fn(() => vi.fn())

    vi.doMock("~/services/webdav/webdavAutoSyncMessaging", () => ({
      onWebdavAutoSyncMessage,
    }))

    const service = await import("~/services/webdav/webdavAutoSyncService")
    vi.spyOn(service.webdavAutoSyncService, "setupAutoSync").mockResolvedValue(
      undefined,
    )
    vi.spyOn(service.webdavAutoSyncService, "syncNow")
      .mockResolvedValueOnce({ success: true, message: "synced" })
      .mockResolvedValueOnce({ success: false, message: "sync failed" })
    vi.spyOn(service.webdavAutoSyncService, "stopAutoSync").mockResolvedValue(
      undefined,
    )
    vi.spyOn(service.webdavAutoSyncService, "updateSettings")
      .mockResolvedValueOnce({
        ok: true,
        savedPreferences: { lastUpdated: 3 } as any,
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: {
          type: "stale",
          expectedLastUpdated: 7,
          actualLastUpdated: 9,
        },
      })
    vi.spyOn(service.webdavAutoSyncService, "getStatus")
      .mockReturnValueOnce({
        isRunning: true,
        isInitialized: true,
        isSyncing: false,
        lastSyncTime: 123,
        lastSyncStatus: "success",
        lastSyncError: null,
      })
      .mockImplementationOnce(() => {
        throw new Error("status failed")
      })

    service.setupWebdavAutoSyncMessagingListeners()
    service.setupWebdavAutoSyncMessagingListeners()

    expect(onWebdavAutoSyncMessage).toHaveBeenCalledTimes(5)
    await expect(
      getRegisteredHandler(onWebdavAutoSyncMessage, "webdavAutoSync:setup")(),
    ).resolves.toEqual({ success: true, data: undefined })
    await expect(
      getRegisteredHandler(onWebdavAutoSyncMessage, "webdavAutoSync:syncNow")(),
    ).resolves.toEqual({ success: true, data: { message: "synced" } })
    await expect(
      getRegisteredHandler(onWebdavAutoSyncMessage, "webdavAutoSync:syncNow")(),
    ).resolves.toEqual({ success: false, error: "sync failed" })
    await expect(
      getRegisteredHandler(onWebdavAutoSyncMessage, "webdavAutoSync:stop")(),
    ).resolves.toEqual({ success: true, data: undefined })
    await expect(
      getRegisteredHandler(
        onWebdavAutoSyncMessage,
        "webdavAutoSync:updateSettings",
      )({
        data: { settings: { autoSync: false }, expectedLastUpdated: 7 },
      }),
    ).resolves.toEqual({
      success: true,
      data: { lastUpdated: 3 },
    })
    await expect(
      getRegisteredHandler(
        onWebdavAutoSyncMessage,
        "webdavAutoSync:updateSettings",
      )({ data: { settings: { autoSync: true } } }),
    ).resolves.toEqual({
      success: false,
      error: "settings:messages.preferencesChangedExternally",
    })
    await expect(
      getRegisteredHandler(
        onWebdavAutoSyncMessage,
        "webdavAutoSync:getStatus",
      )(),
    ).resolves.toEqual({
      success: true,
      data: {
        isRunning: true,
        isInitialized: true,
        isSyncing: false,
        lastSyncTime: 123,
        lastSyncStatus: "success",
        lastSyncError: null,
      },
    })
    await expect(
      getRegisteredHandler(
        onWebdavAutoSyncMessage,
        "webdavAutoSync:getStatus",
      )(),
    ).resolves.toEqual({
      success: false,
      error: "status failed",
    })
  })

  it("routes balance-history typed listeners through runtime resolvers", async () => {
    const onBalanceHistoryMessage: OnMessageMock = vi.fn(() => vi.fn())

    vi.doMock("~/services/history/dailyBalanceHistory/messaging", () => ({
      onBalanceHistoryMessage,
    }))

    const scheduler = await import(
      "~/services/history/dailyBalanceHistory/scheduler"
    )
    vi.spyOn(
      scheduler.dailyBalanceHistoryScheduler,
      "updateSettings",
    ).mockResolvedValue({ warning: "warning" })
    vi.spyOn(
      scheduler.dailyBalanceHistoryScheduler,
      "refreshNow",
    ).mockResolvedValue({
      success: 1,
      failed: 0,
      refreshedCount: 1,
    })
    vi.spyOn(scheduler.dailyBalanceHistoryScheduler, "pruneNow")
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    scheduler.setupDailyBalanceHistoryMessagingListeners()
    scheduler.setupDailyBalanceHistoryMessagingListeners()

    expect(onBalanceHistoryMessage).toHaveBeenCalledTimes(3)
    await expect(
      getRegisteredHandler(
        onBalanceHistoryMessage,
        "balanceHistory:updateSettings",
      )({ data: { settings: { retentionDays: 7 } } }),
    ).resolves.toEqual({
      success: true,
      data: { warning: "warning" },
    })
    await expect(
      getRegisteredHandler(
        onBalanceHistoryMessage,
        "balanceHistory:refreshNow",
      )({
        data: {
          accountIds: ["account-1"],
          protectionBypassExecution: ACCOUNT_REFRESH_EXECUTION,
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        success: 1,
        failed: 0,
        refreshedCount: 1,
      },
    })
    expect(
      scheduler.dailyBalanceHistoryScheduler.refreshNow,
    ).toHaveBeenCalledWith(
      ACCOUNT_REFRESH_EXECUTION,
      ["account-1"],
      TEMP_WINDOW_REQUEST_SOURCES.Options,
    )
    await expect(
      getRegisteredHandler(
        onBalanceHistoryMessage,
        "balanceHistory:refreshNow",
      )({
        data: {
          accountIds: "bad",
          protectionBypassExecution: ACCOUNT_REFRESH_EXECUTION,
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: false,
      error: "accountIds must be an array when provided",
    })
    await expect(
      getRegisteredHandler(
        onBalanceHistoryMessage,
        "balanceHistory:refreshNow",
      )({
        data: {
          protectionBypassExecution: ACCOUNT_REFRESH_EXECUTION,
        },
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        success: 1,
        failed: 0,
        refreshedCount: 1,
      },
    })
    expect(
      scheduler.dailyBalanceHistoryScheduler.refreshNow,
    ).toHaveBeenLastCalledWith(
      ACCOUNT_REFRESH_EXECUTION,
      undefined,
      TEMP_WINDOW_REQUEST_SOURCES.Options,
    )
    await expect(
      getRegisteredHandler(onBalanceHistoryMessage, "balanceHistory:prune")(),
    ).resolves.toEqual({ success: true, data: undefined })
    await expect(
      getRegisteredHandler(onBalanceHistoryMessage, "balanceHistory:prune")(),
    ).resolves.toEqual({
      success: false,
      error: "Failed to prune balance history",
    })
  })

  it("preserves Balance History UI ownership through account refresh fallback", async () => {
    const onBalanceHistoryMessage: OnMessageMock = vi.fn(() => vi.fn())
    const authorizeDecisions: unknown[] = []
    const executeAuthorizedTempContextTask = vi.fn(
      async (_task, _source, authorizeAtAcquire, sendResponse) => {
        const decision = await authorizeAtAcquire()
        authorizeDecisions.push(decision)
        sendResponse({ success: decision.kind === "allowed" })
      },
    )
    const refreshAllAccounts = vi.fn(async (_force, options) => {
      const { protectionBypassCoordinator } = await import(
        "~/entrypoints/background/protectionBypassCoordinator"
      )
      const response = await protectionBypassCoordinator.execute({
        task: {
          kind: "api_fallback_fetch",
          params: {
            originUrl: "https://example.invalid",
            fetchUrl: "https://example.invalid/api/account",
            requestId: "balance-history-continuation",
          },
        },
        execution: options.protectionBypassExecution,
      })
      if (!(response as any)?.success)
        throw new Error("Coordinator denied task")
      return {
        success: 1,
        failed: 0,
        refreshedCount: 1,
        latestSyncTime: Date.now(),
      }
    })

    vi.doMock("~/entrypoints/background/tempWindowPool", () => ({
      executeAuthorizedTempContextTask,
    }))
    vi.doMock("~/services/history/dailyBalanceHistory/messaging", () => ({
      onBalanceHistoryMessage,
    }))
    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: { refreshAllAccounts },
      resolveAccountTodayStatsAvailability: vi.fn(),
    }))
    vi.doMock("~/services/preferences/userPreferences", async () => {
      const actual = await vi.importActual<
        typeof import("~/services/preferences/userPreferences")
      >("~/services/preferences/userPreferences")
      return {
        ...actual,
        userPreferences: {
          getPreferences: vi.fn().mockResolvedValue(actual.DEFAULT_PREFERENCES),
          getPreferencesStrict: vi
            .fn()
            .mockResolvedValue(actual.DEFAULT_PREFERENCES),
          savePreferences: vi.fn(),
        },
      }
    })

    const execution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
    )
    const scheduler = await import(
      "~/services/history/dailyBalanceHistory/scheduler"
    )
    scheduler.setupDailyBalanceHistoryMessagingListeners()

    await expect(
      getRegisteredHandler(
        onBalanceHistoryMessage,
        "balanceHistory:refreshNow",
      )({
        data: { protectionBypassExecution: execution },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: true,
      data: { success: 1, failed: 0, refreshedCount: 1 },
    })
    expect(refreshAllAccounts).toHaveBeenCalledWith(true, {
      protectionBypassExecution: execution,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Options,
    })
    expect(authorizeDecisions).toEqual([
      expect.objectContaining({
        kind: "allowed",
        feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
        surface: TEMP_WINDOW_REQUEST_SOURCES.Options,
      }),
    ])
  })

  it("routes usage-history typed listeners through runtime resolvers", async () => {
    const onUsageHistoryMessage: OnMessageMock = vi.fn(() => vi.fn())

    vi.doMock("~/services/history/usageHistory/messaging", () => ({
      onUsageHistoryMessage,
    }))
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: { usageHistory: { retentionDays: 30 } },
      userPreferences: {
        getPreferences: vi.fn().mockResolvedValue({
          usageHistory: { retentionDays: 14 },
        }),
      },
    }))
    vi.doMock("~/services/history/usageHistory/storage", () => ({
      usageHistoryStorage: {
        pruneAllAccounts: vi
          .fn()
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false),
      },
    }))

    const scheduler = await import("~/services/history/usageHistory/scheduler")
    vi.spyOn(
      scheduler.usageHistoryScheduler,
      "updateSettings",
    ).mockResolvedValue({ warning: "warning" })
    vi.spyOn(scheduler.usageHistoryScheduler, "runManualSync")
      .mockResolvedValueOnce({
        totals: { success: 1, skipped: 0, error: 0, unsupported: 0 },
        perAccount: [],
      })
      .mockResolvedValueOnce(null)

    scheduler.setupUsageHistoryMessagingListeners()
    scheduler.setupUsageHistoryMessagingListeners()

    expect(onUsageHistoryMessage).toHaveBeenCalledTimes(3)
    await expect(
      getRegisteredHandler(
        onUsageHistoryMessage,
        "usageHistory:updateSettings",
      )({ data: { settings: { enabled: false } } }),
    ).resolves.toEqual({
      success: true,
      data: { warning: "warning" },
    })
    await expect(
      getRegisteredHandler(
        onUsageHistoryMessage,
        "usageHistory:syncNow",
      )({
        data: { accountIds: ["account-1"] },
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        totals: { success: 1, skipped: 0, error: 0, unsupported: 0 },
        perAccount: [],
      },
    })
    await expect(
      getRegisteredHandler(
        onUsageHistoryMessage,
        "usageHistory:syncNow",
      )({
        data: { accountIds: "bad" },
      }),
    ).resolves.toEqual({
      success: false,
      error: "accountIds must be an array when provided",
    })
    await expect(
      getRegisteredHandler(
        onUsageHistoryMessage,
        "usageHistory:syncNow",
      )({
        data: {},
      }),
    ).resolves.toEqual({
      success: false,
      error: "Usage-history sync is already running",
    })
    await expect(
      getRegisteredHandler(onUsageHistoryMessage, "usageHistory:prune")(),
    ).resolves.toEqual({ success: true, data: undefined })
    await expect(
      getRegisteredHandler(onUsageHistoryMessage, "usageHistory:prune")(),
    ).resolves.toEqual({
      success: false,
      error: "Failed to prune usage history",
    })
  })

  it("routes release-update typed listeners through runtime resolvers", async () => {
    const onReleaseUpdateMessage: OnMessageMock = vi.fn(() => vi.fn())

    vi.doMock("~/services/updates/messaging", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/services/updates/messaging")>()
      return {
        ...actual,
        onReleaseUpdateMessage,
      }
    })

    const service = await import("~/services/updates/releaseUpdateService")
    vi.spyOn(service.releaseUpdateService, "getStatus").mockResolvedValue({
      eligible: true,
    } as any)
    vi.spyOn(service.releaseUpdateService, "checkNow")
      .mockResolvedValueOnce({ eligible: false } as any)
      .mockRejectedValueOnce(new Error("check failed"))

    service.setupReleaseUpdateMessagingListeners()
    service.setupReleaseUpdateMessagingListeners()

    expect(onReleaseUpdateMessage).toHaveBeenCalledTimes(2)
    await expect(
      getRegisteredHandler(onReleaseUpdateMessage, "releaseUpdate:getStatus")(),
    ).resolves.toEqual({
      success: true,
      data: { eligible: true },
    })
    await expect(
      getRegisteredHandler(onReleaseUpdateMessage, "releaseUpdate:checkNow")(),
    ).resolves.toEqual({
      success: true,
      data: { eligible: false },
    })
    await expect(
      getRegisteredHandler(onReleaseUpdateMessage, "releaseUpdate:checkNow")(),
    ).resolves.toEqual({
      success: false,
      error: "check failed",
    })
  })

  it("routes LDOH site lookup typed listeners through background refresh", async () => {
    const onLdohSiteLookupMessage: OnMessageMock = vi.fn(() => vi.fn())
    const fetchApi = vi.fn().mockResolvedValue({
      sites: [{ id: "site-1" }],
    })
    const writeCache = vi.fn().mockResolvedValue({
      version: 1,
      fetchedAt: 1,
      expiresAt: 2,
      items: [{ id: "site-1" }],
    })

    vi.doMock("~/services/apiTransport/request", () => ({
      fetchApi,
    }))
    vi.doMock("~/services/integrations/ldohSiteLookup/runtime", async () => {
      const actual = await vi.importActual<
        typeof import("~/services/integrations/ldohSiteLookup/runtime")
      >("~/services/integrations/ldohSiteLookup/runtime")
      return {
        ...actual,
        onLdohSiteLookupMessage,
      }
    })
    vi.doMock("~/services/integrations/ldohSiteLookup/cache", () => ({
      writeLdohSiteListCache: writeCache,
    }))
    vi.doMock("~/services/preferences/userPreferences", () => ({
      userPreferences: {
        getPreferences: vi.fn().mockResolvedValue({
          tempWindowFallback: { enabled: false },
        }),
      },
    }))

    const background = await import(
      "~/services/integrations/ldohSiteLookup/background"
    )

    background.setupLdohSiteLookupMessagingListeners()
    background.setupLdohSiteLookupMessagingListeners()

    expect(onLdohSiteLookupMessage).toHaveBeenCalledTimes(1)
    const refreshHandler = getRegisteredHandler(
      onLdohSiteLookupMessage,
      "ldohSiteLookup:refreshSites",
    )
    const validUiRequests = [
      {
        execution: UI_LDOH_SITE_DETECTION_EXECUTION,
        sender: { url: "https://example.invalid/popup.html" },
      },
      {
        execution: OPTIONS_LDOH_SITE_DETECTION_EXECUTION,
        sender: { url: "moz-extension://test/options.html#/accounts" },
      },
    ] as const

    for (const { execution, sender } of validUiRequests) {
      await expect(
        refreshHandler({
          data: { protectionBypassExecution: structuredClone(execution) },
          sender,
        }),
      ).resolves.toEqual({
        success: true,
        cachedCount: 1,
      })
      expect(fetchApi.mock.lastCall?.[0].protectionBypassExecution).toEqual(
        execution,
      )
    }

    fetchApi.mockClear()
    await expect(
      refreshHandler({
        data: {},
        sender: { url: "chrome-extension://test/popup.html" },
      }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid protection bypass execution",
    })

    const invalidUiRequests = [
      {
        execution: {
          version: 1,
          kind: "user_command",
          command: "refresh_account",
          surface: "popup",
        },
        sender: { url: "chrome-extension://test/popup.html" },
      },
      {
        execution: {
          ...UI_LDOH_SITE_DETECTION_EXECUTION,
          feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
        },
        sender: { url: "chrome-extension://test/popup.html" },
      },
      {
        execution: {
          ...UI_LDOH_SITE_DETECTION_EXECUTION,
          trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
        },
        sender: { url: "chrome-extension://test/popup.html" },
      },
      {
        execution: {
          ...UI_LDOH_SITE_DETECTION_EXECUTION,
          surface: TEMP_WINDOW_REQUEST_SOURCES.Background,
        },
        sender: { url: "chrome-extension://test/background.html" },
      },
      {
        execution: {
          ...UI_LDOH_SITE_DETECTION_EXECUTION,
          surface: "invalid-surface",
        },
        sender: { url: "chrome-extension://test/popup.html" },
      },
    ]

    for (const { execution, sender } of invalidUiRequests) {
      await expect(
        refreshHandler({
          data: { protectionBypassExecution: execution },
          sender,
        }),
      ).resolves.toEqual({
        success: false,
        error: "Invalid protection bypass execution",
      })
    }
    expect(fetchApi).not.toHaveBeenCalled()

    await expect(background.repairLdohSiteListCache()).resolves.toEqual({
      success: true,
      cachedCount: 1,
    })
    expect(fetchApi).toHaveBeenCalledWith(
      expect.objectContaining({
        protectionBypassExecution: {
          version: 1,
          kind: "automatic",
          feature: "site_detection",
          trigger: "background_recovery",
          surface: TEMP_WINDOW_REQUEST_SOURCES.Background,
        },
      }),
      expect.any(Object),
      true,
    )

    fetchApi.mockRejectedValueOnce(new Error("network failed"))
    await expect(
      refreshHandler({
        data: {
          protectionBypassExecution: UI_LDOH_SITE_DETECTION_EXECUTION,
        },
        sender: { url: "chrome-extension://test/popup.html" },
      }),
    ).resolves.toEqual({ success: false, error: "network failed" })
  })

  it("preserves an LDOH UI lifecycle owner through final coordinator acquire", async () => {
    const onLdohSiteLookupMessage: OnMessageMock = vi.fn(() => vi.fn())
    const authorizeDecisions: unknown[] = []
    const executeAuthorizedTempContextTask = vi.fn(
      async (_task, _source, authorizeAtAcquire, sendResponse) => {
        const decision = await authorizeAtAcquire()
        authorizeDecisions.push(decision)
        sendResponse({ success: decision.kind === "allowed" })
      },
    )
    const writeCache = vi.fn().mockResolvedValue({
      version: 1,
      fetchedAt: 1,
      expiresAt: 2,
      items: [],
    })

    vi.doMock("~/entrypoints/background/tempWindowPool", () => ({
      executeAuthorizedTempContextTask,
    }))
    vi.doMock("~/services/preferences/userPreferences", async () => {
      const actual = await vi.importActual<
        typeof import("~/services/preferences/userPreferences")
      >("~/services/preferences/userPreferences")
      return {
        ...actual,
        userPreferences: {
          getPreferences: vi.fn().mockResolvedValue(actual.DEFAULT_PREFERENCES),
          getPreferencesStrict: vi
            .fn()
            .mockResolvedValue(actual.DEFAULT_PREFERENCES),
        },
      }
    })
    vi.doMock("~/services/integrations/ldohSiteLookup/runtime", async () => {
      const actual = await vi.importActual<
        typeof import("~/services/integrations/ldohSiteLookup/runtime")
      >("~/services/integrations/ldohSiteLookup/runtime")
      return { ...actual, onLdohSiteLookupMessage }
    })
    vi.doMock("~/services/integrations/ldohSiteLookup/cache", () => ({
      writeLdohSiteListCache: writeCache,
    }))
    vi.doMock("~/services/apiTransport/request", () => ({
      fetchApi: vi.fn(async (request) => {
        const { protectionBypassCoordinator } = await import(
          "~/entrypoints/background/protectionBypassCoordinator"
        )
        const response = await protectionBypassCoordinator.execute({
          task: {
            kind: "rendered_title",
            params: {
              originUrl: "https://example.invalid",
              requestId: "ldoh-continuation",
            },
          },
          execution: request.protectionBypassExecution,
        })
        if (!(response as any)?.success)
          throw new Error("Coordinator denied task")
        return { sites: [] }
      }),
    }))

    const background = await import(
      "~/services/integrations/ldohSiteLookup/background"
    )
    background.setupLdohSiteLookupMessagingListeners()

    await expect(
      getRegisteredHandler(
        onLdohSiteLookupMessage,
        "ldohSiteLookup:refreshSites",
      )({
        data: {
          protectionBypassExecution: UI_LDOH_SITE_DETECTION_EXECUTION,
        },
        sender: { url: "chrome-extension://test/popup.html" },
      }),
    ).resolves.toEqual({ success: true, cachedCount: 0 })
    expect(executeAuthorizedTempContextTask).toHaveBeenCalledTimes(1)
    const { fetchApi } = await import("~/services/apiTransport/request")
    expect(fetchApi).toHaveBeenCalledWith(
      expect.objectContaining({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
      expect.any(Object),
      true,
    )
    expect(authorizeDecisions).toEqual([
      expect.objectContaining({
        kind: "allowed",
        feature: PROTECTION_BYPASS_FEATURES.SiteDetection,
        surface: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
    ])
  })

  it("registers auto check-in typed listeners once and wraps handler errors", async () => {
    const onAutoCheckinMessage: OnMessageMock = vi.fn(() => vi.fn())
    const getStatus = vi.fn().mockRejectedValue(new Error("check-in failed"))

    vi.doMock("~/services/checkin/autoCheckin/messaging", () => ({
      onAutoCheckinMessage,
    }))
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: { autoCheckin: {} },
      userPreferences: { getPreferences: vi.fn(), savePreferences: vi.fn() },
    }))
    vi.doMock("~/services/checkin/autoCheckin/storage", () => ({
      AUTO_CHECKIN_STATUS_STORAGE_LOCK: "all-api-hub:auto-checkin-status",
      autoCheckinStorage: {
        getStatus,
        saveStatus: vi.fn(),
      },
    }))

    const scheduler = await import("~/services/checkin/autoCheckin/scheduler")

    scheduler.setupAutoCheckinMessagingListeners()
    scheduler.setupAutoCheckinMessagingListeners()

    expect(onAutoCheckinMessage).toHaveBeenCalledTimes(10)
    const getStatusHandler = onAutoCheckinMessage.mock.calls.find(
      ([type]) => type === "autoCheckin:getStatus",
    )?.[1]
    expect(getStatusHandler).toBeTypeOf("function")
    await expect(getStatusHandler!()).resolves.toEqual({
      success: false,
      error: "check-in failed",
    })
  })

  it("routes auto check-in typed listeners through each scheduler action", async () => {
    const onAutoCheckinMessage: OnMessageMock = vi.fn(() => vi.fn())
    const runCheckins = vi.fn().mockResolvedValue(undefined)
    const debugTriggerDailyAlarmNow = vi.fn().mockResolvedValue(undefined)
    const debugTriggerRetryAlarmNow = vi.fn().mockResolvedValue(undefined)
    const debugResetLastDailyRunDay = vi.fn().mockResolvedValue(undefined)
    const debugScheduleDailyAlarmForToday = vi.fn().mockResolvedValue(123)
    const pretriggerDailyOnUiOpen = vi.fn().mockResolvedValue({
      started: true,
      eligible: true,
    })
    const retryAccount = vi.fn().mockResolvedValue({
      summary: { executed: 1 },
      pendingRetry: false,
    })
    const getAccountDisplayData = vi.fn().mockResolvedValue({
      id: "account-1",
      siteName: "Example",
    })
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const getStatus = vi.fn().mockResolvedValue({ lastRunResult: "success" })
    const scheduleNextRun = vi.fn().mockResolvedValue(undefined)

    vi.doMock("~/services/checkin/autoCheckin/messaging", () => ({
      onAutoCheckinMessage,
    }))
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: { autoCheckin: {} },
      userPreferences: { getPreferences: vi.fn(), savePreferences: vi.fn() },
    }))
    vi.doMock("~/services/checkin/autoCheckin/storage", () => ({
      AUTO_CHECKIN_STATUS_STORAGE_LOCK: "all-api-hub:auto-checkin-status",
      autoCheckinStorage: {
        getStatus,
        saveStatus: vi.fn(),
      },
    }))

    const scheduler = await import("~/services/checkin/autoCheckin/scheduler")
    vi.spyOn(scheduler.autoCheckinScheduler, "runCheckins").mockImplementation(
      runCheckins,
    )
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "debugTriggerDailyAlarmNow",
    ).mockImplementation(debugTriggerDailyAlarmNow)
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "debugTriggerRetryAlarmNow",
    ).mockImplementation(debugTriggerRetryAlarmNow)
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "debugResetLastDailyRunDay",
    ).mockImplementation(debugResetLastDailyRunDay)
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "debugScheduleDailyAlarmForToday",
    ).mockImplementation(debugScheduleDailyAlarmForToday)
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "pretriggerDailyOnUiOpen",
    ).mockImplementation(pretriggerDailyOnUiOpen)
    vi.spyOn(scheduler.autoCheckinScheduler, "retryAccount").mockImplementation(
      retryAccount,
    )
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "getAccountDisplayData",
    ).mockImplementation(getAccountDisplayData)
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "updateSettings",
    ).mockImplementation(updateSettings)
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "scheduleNextRun",
    ).mockImplementation(scheduleNextRun)

    scheduler.setupAutoCheckinMessagingListeners()

    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:runNow",
      )({
        data: {
          accountIds: [" a ", "b", "a"],
          protectionBypassExecution: MANUAL_CHECKIN_EXECUTION,
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({ success: true })
    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:runNow",
      )({
        data: {
          accountIds: [""],
          protectionBypassExecution: MANUAL_CHECKIN_EXECUTION,
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid payload: accountIds must be a non-empty string[]",
    })
    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:debugTriggerDailyAlarmNow",
      )(),
    ).resolves.toEqual({ success: true })
    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:debugTriggerRetryAlarmNow",
      )(),
    ).resolves.toEqual({ success: true })
    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:debugResetLastDailyRunDay",
      )(),
    ).resolves.toEqual({ success: true })
    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:debugScheduleDailyAlarmForToday",
      )({ data: { minutesFromNow: 5 } }),
    ).resolves.toEqual({ success: true, scheduledTime: 123 })
    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:pretriggerDailyOnUiOpen",
      )({
        data: {
          requestId: "request-1",
          dryRun: true,
          protectionBypassExecution: UI_OPEN_CHECKIN_EXECUTION,
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: true,
      started: true,
      eligible: true,
    })
    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:retryAccount",
      )({
        data: {
          accountId: "account-1",
          protectionBypassExecution: RETRY_CHECKIN_EXECUTION,
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({ success: true })
    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:retryAccount",
      )({
        data: {
          protectionBypassExecution: RETRY_CHECKIN_EXECUTION,
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: false,
      error: "Missing accountId",
    })
    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:runNow",
      )({
        data: {
          protectionBypassExecution: ACCOUNT_REFRESH_EXECUTION,
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: false,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    })
    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:retryAccount",
      )({
        data: {
          accountId: "account-1",
          protectionBypassExecution: MANUAL_CHECKIN_EXECUTION,
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({
      success: false,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    })
    for (const [type, data] of [
      [
        "autoCheckin:runNow",
        {
          protectionBypassExecution: MANUAL_CHECKIN_EXECUTION,
        },
      ],
      [
        "autoCheckin:pretriggerDailyOnUiOpen",
        {
          protectionBypassExecution: UI_OPEN_CHECKIN_EXECUTION,
        },
      ],
      [
        "autoCheckin:retryAccount",
        {
          accountId: "account-1",
          protectionBypassExecution: RETRY_CHECKIN_EXECUTION,
        },
      ],
    ] as const) {
      await expect(
        getRegisteredHandler(
          onAutoCheckinMessage,
          type,
        )({
          data: { ...data, protectionBypassExecution: {} },
        }),
      ).resolves.toEqual({
        success: false,
        error: "Invalid protection bypass execution",
      })
    }
    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:getAccountInfo",
      )({
        data: { accountId: "account-1", includeDisabled: true },
      }),
    ).resolves.toEqual({
      success: true,
      data: { id: "account-1", siteName: "Example" },
    })
    await expect(
      getRegisteredHandler(onAutoCheckinMessage, "autoCheckin:getStatus")(),
    ).resolves.toEqual({
      success: true,
      data: { lastRunResult: "success" },
    })
    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:updateSettings",
      )({
        data: { settings: { globalEnabled: false } },
      }),
    ).resolves.toEqual({ success: true })

    expect(runCheckins).toHaveBeenCalledWith({
      runType: "manual",
      targetAccountIds: ["a", "b"],
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Options,
      protectionBypassExecution: MANUAL_CHECKIN_EXECUTION,
    })
    expect(runCheckins).toHaveBeenCalledTimes(1)
    expect(scheduleNextRun).toHaveBeenCalledWith({ preserveExisting: true })
    expect(debugScheduleDailyAlarmForToday).toHaveBeenCalledWith({
      minutesFromNow: 5,
    })
    expect(pretriggerDailyOnUiOpen).toHaveBeenCalledWith({
      requestId: "request-1",
      dryRun: true,
      debug: undefined,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Options,
      protectionBypassExecution: UI_OPEN_CHECKIN_EXECUTION,
    })
    expect(retryAccount).toHaveBeenCalledWith(
      "account-1",
      TEMP_WINDOW_REQUEST_SOURCES.Options,
      RETRY_CHECKIN_EXECUTION,
    )
    expect(retryAccount).toHaveBeenCalledTimes(1)
    expect(getAccountDisplayData).toHaveBeenCalledWith("account-1", {
      includeDisabled: true,
    })
    expect(updateSettings).toHaveBeenCalledWith({ globalEnabled: false })
  })

  it("preserves AutoCheckin UI command ownership through scheduler and temp task", async () => {
    const onAutoCheckinMessage: OnMessageMock = vi.fn(() => vi.fn())
    const authorizeDecisions: unknown[] = []
    const executeAuthorizedTempContextTask = vi.fn(
      async (_task, _source, authorizeAtAcquire, sendResponse) => {
        const decision = await authorizeAtAcquire()
        authorizeDecisions.push(decision)
        sendResponse({ success: decision.kind === "allowed" })
      },
    )
    let savedStatus: unknown = null

    vi.doMock("~/entrypoints/background/tempWindowPool", () => ({
      executeAuthorizedTempContextTask,
    }))
    vi.doMock("~/services/checkin/autoCheckin/messaging", () => ({
      onAutoCheckinMessage,
    }))
    vi.doMock("~/services/preferences/userPreferences", async () => {
      const actual = await vi.importActual<
        typeof import("~/services/preferences/userPreferences")
      >("~/services/preferences/userPreferences")
      const preferences = {
        ...actual.DEFAULT_PREFERENCES,
        autoCheckin: {
          ...actual.DEFAULT_PREFERENCES.autoCheckin,
          globalEnabled: true,
          notifyUiOnCompletion: false,
          retryStrategy: {
            enabled: false,
            intervalMinutes: 30,
            maxAttemptsPerDay: 3,
          },
        },
      }
      return {
        ...actual,
        userPreferences: {
          getPreferences: vi.fn().mockResolvedValue(preferences),
          getPreferencesStrict: vi.fn().mockResolvedValue(preferences),
          savePreferences: vi.fn(),
        },
      }
    })
    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        getAllAccounts: vi.fn().mockResolvedValue([
          {
            id: "account-1",
            disabled: false,
            site_name: "Example",
            site_type: "Veloera",
            account_info: { username: "user" },
            checkIn: { enableDetection: true, autoCheckInEnabled: true },
          },
        ]),
        getEnabledAccounts: vi.fn(),
        updateAccount: vi.fn(),
        markAccountAsSiteCheckedIn: vi.fn().mockResolvedValue(undefined),
        refreshAccount: vi.fn(),
        getAccountById: vi.fn(),
        getDisplayDataById: vi.fn(),
        convertToDisplayData: vi.fn(),
      },
    }))
    vi.doMock("~/services/checkin/autoCheckin/storage", () => ({
      AUTO_CHECKIN_STATUS_STORAGE_LOCK: "all-api-hub:auto-checkin-status",
      autoCheckinStorage: {
        getStatus: vi.fn(async () => savedStatus),
        saveStatus: vi.fn(async (status) => {
          savedStatus = status
          return true
        }),
      },
    }))
    vi.doMock("~/services/core/storageWriteLock", () => ({
      withExtensionStorageWriteLock: vi.fn(async (_name, work) => await work()),
    }))
    vi.doMock("~/services/productAnalytics/actions", () => ({
      trackProductAnalyticsActionCompleted: vi.fn(),
    }))
    vi.doMock("~/services/productAnalytics/autoCheckin", () => ({
      buildAutoCheckinDiagnostics: vi.fn(() => ({})),
      trackAutoCheckinConfigSnapshot: vi.fn(),
      trackAutoCheckinRunAnalytics: vi.fn(),
    }))
    vi.doMock("~/services/notifications/taskNotificationService", () => ({
      notifyTaskResult: vi.fn(),
    }))
    vi.doMock("~/utils/browser/browserApi", async () => {
      const actual = await vi.importActual<
        typeof import("~/utils/browser/browserApi")
      >("~/utils/browser/browserApi")
      return {
        ...actual,
        clearAlarm: vi.fn(),
        createAlarm: vi.fn(),
        getAlarm: vi.fn().mockResolvedValue(undefined),
        hasAlarmsAPI: vi.fn().mockReturnValue(true),
        isMessageReceiverUnavailableError: vi.fn().mockReturnValue(false),
        onAlarm: vi.fn(),
        sendRuntimeMessage: vi.fn().mockResolvedValue(undefined),
      }
    })
    vi.doMock("~/services/checkin/autoCheckin/providers", () => ({
      resolveAutoCheckinProvider: vi.fn(() => ({
        canCheckIn: vi.fn(() => true),
        checkIn: vi.fn(async (_account, context) => {
          const { protectionBypassCoordinator } = await import(
            "~/entrypoints/background/protectionBypassCoordinator"
          )
          const response = await protectionBypassCoordinator.execute({
            task: {
              kind: "turnstile_fetch",
              params: {
                originUrl: "https://example.invalid",
                pageUrl: "https://example.invalid/checkin",
                fetchUrl: "https://example.invalid/api/checkin",
                requestId: "auto-checkin-continuation",
              },
            },
            execution: context.protectionBypassExecution,
          })
          return (response as any)?.success
            ? { status: "success" }
            : { status: "failed", rawMessage: "Coordinator denied task" }
        }),
      })),
    }))

    const execution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
    )
    const scheduler = await import("~/services/checkin/autoCheckin/scheduler")
    scheduler.setupAutoCheckinMessagingListeners()

    await expect(
      getRegisteredHandler(
        onAutoCheckinMessage,
        "autoCheckin:runNow",
      )({
        data: {
          accountIds: ["account-1"],
          protectionBypassExecution: execution,
        },
        sender: OPTIONS_SENDER,
      }),
    ).resolves.toEqual({ success: true })
    expect(executeAuthorizedTempContextTask).toHaveBeenCalledTimes(1)
    expect(authorizeDecisions).toEqual([
      expect.objectContaining({
        kind: "allowed",
        feature: PROTECTION_BYPASS_FEATURES.Checkin,
        surface: TEMP_WINDOW_REQUEST_SOURCES.Options,
      }),
    ])
  })

  it("wraps every auto check-in typed listener failure", async () => {
    const onAutoCheckinMessage: OnMessageMock = vi.fn(() => vi.fn())

    vi.doMock("~/services/checkin/autoCheckin/messaging", () => ({
      onAutoCheckinMessage,
    }))
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: { autoCheckin: {} },
      userPreferences: { getPreferences: vi.fn(), savePreferences: vi.fn() },
    }))
    vi.doMock("~/services/checkin/autoCheckin/storage", () => ({
      AUTO_CHECKIN_STATUS_STORAGE_LOCK: "all-api-hub:auto-checkin-status",
      autoCheckinStorage: {
        getStatus: vi.fn().mockRejectedValue(new Error("status failed")),
        saveStatus: vi.fn(),
      },
    }))

    const scheduler = await import("~/services/checkin/autoCheckin/scheduler")
    vi.spyOn(scheduler.autoCheckinScheduler, "runCheckins").mockRejectedValue(
      new Error("run failed"),
    )
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "scheduleNextRun",
    ).mockRejectedValue(new Error("reschedule failed"))
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "debugTriggerDailyAlarmNow",
    ).mockRejectedValue(new Error("daily debug failed"))
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "debugTriggerRetryAlarmNow",
    ).mockRejectedValue(new Error("retry debug failed"))
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "debugResetLastDailyRunDay",
    ).mockRejectedValue(new Error("reset failed"))
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "debugScheduleDailyAlarmForToday",
    ).mockRejectedValue(new Error("schedule today failed"))
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "pretriggerDailyOnUiOpen",
    ).mockRejectedValue(new Error("pretrigger failed"))
    vi.spyOn(scheduler.autoCheckinScheduler, "retryAccount").mockRejectedValue(
      new Error("retry failed"),
    )
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "getAccountDisplayData",
    ).mockRejectedValue(new Error("account info failed"))
    vi.spyOn(
      scheduler.autoCheckinScheduler,
      "updateSettings",
    ).mockRejectedValue(new Error("settings failed"))

    scheduler.setupAutoCheckinMessagingListeners()

    for (const [type, input, error] of [
      [
        "autoCheckin:runNow",
        {
          data: {
            accountIds: ["account-1"],
            protectionBypassExecution: MANUAL_CHECKIN_EXECUTION,
          },
          sender: OPTIONS_SENDER,
        },
        "run failed",
      ],
      [
        "autoCheckin:debugTriggerDailyAlarmNow",
        undefined,
        "daily debug failed",
      ],
      [
        "autoCheckin:debugTriggerRetryAlarmNow",
        undefined,
        "retry debug failed",
      ],
      ["autoCheckin:debugResetLastDailyRunDay", undefined, "reset failed"],
      [
        "autoCheckin:debugScheduleDailyAlarmForToday",
        { data: {} },
        "schedule today failed",
      ],
      [
        "autoCheckin:pretriggerDailyOnUiOpen",
        {
          data: {
            protectionBypassExecution: UI_OPEN_CHECKIN_EXECUTION,
          },
          sender: OPTIONS_SENDER,
        },
        "pretrigger failed",
      ],
      [
        "autoCheckin:retryAccount",
        {
          data: {
            accountId: "account-1",
            protectionBypassExecution: RETRY_CHECKIN_EXECUTION,
          },
          sender: OPTIONS_SENDER,
        },
        "retry failed",
      ],
      [
        "autoCheckin:getAccountInfo",
        { data: { accountId: "account-1" } },
        "account info failed",
      ],
      ["autoCheckin:getStatus", undefined, "status failed"],
      [
        "autoCheckin:updateSettings",
        { data: { settings: {} } },
        "settings failed",
      ],
    ] as const) {
      await expect(
        getRegisteredHandler(onAutoCheckinMessage, type)(input),
      ).resolves.toEqual({
        success: false,
        error,
      })
    }
  })
})
