import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { accountStorage } from "~/services/accounts/accountStorage"
import { AutoRefreshMessageTypes } from "~/services/accounts/autoRefreshMessaging"
import {
  autoRefreshService,
  resolveAutoRefreshGetStatusMessage,
  resolveAutoRefreshRefreshNowMessage,
  resolveAutoRefreshSetupMessage,
  resolveAutoRefreshStopMessage,
  resolveAutoRefreshUpdateSettingsMessage,
  setupAutoRefreshMessagingListeners,
} from "~/services/accounts/autoRefreshService"
import { usageHistoryScheduler } from "~/services/history/usageHistory/scheduler"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

const preferenceWriteSuccess = (
  preferences: Partial<UserPreferences> = {},
) => ({
  ok: true as const,
  preferences: {
    ...DEFAULT_PREFERENCES,
    accountAutoRefresh: DEFAULT_ACCOUNT_AUTO_REFRESH,
    ...preferences,
  },
})

const { mockExecuteAuthorizedTempContextTask, mockOnAutoRefreshMessage } =
  vi.hoisted(() => ({
    mockExecuteAuthorizedTempContextTask: vi.fn(),
    mockOnAutoRefreshMessage: vi.fn(() => vi.fn()),
  }))

// Mock dependencies.
//
// The project uses the unified logger, which suppresses direct `console.*` output by default in tests.
// These tests focus on behavior (timers, messages, storage calls) rather than console emission.
vi.mock("~/utils/core/error", () => ({
  getErrorMessage: vi.fn((error) => `${String(error)}`),
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    refreshAllAccounts: vi.fn(),
  },
}))

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()

  return {
    ...actual,
    userPreferences: {
      getPreferences: vi.fn(),
      getPreferencesStrict: vi.fn(),
      savePreferences: vi.fn(),
    },
  }
})

vi.mock("~/services/history/usageHistory/scheduler", () => ({
  usageHistoryScheduler: {
    runAfterRefreshSync: vi.fn(),
  },
}))

vi.mock("~/entrypoints/background/tempWindowPool", () => ({
  executeAuthorizedTempContextTask: mockExecuteAuthorizedTempContextTask,
}))

vi.mock("~/services/accounts/autoRefreshMessaging", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/accounts/autoRefreshMessaging")
    >()
  return {
    ...actual,
    onAutoRefreshMessage: mockOnAutoRefreshMessage,
  }
})

// Mock browser runtime using vi.stubGlobal like other tests
const mockSendMessage = vi.fn()
const originalBrowser = (globalThis as any).browser
vi.stubGlobal("browser", {
  runtime: {
    sendMessage: mockSendMessage,
  },
})

const refreshAllExecution = userCommandExecution(
  PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
)

afterAll(() => {
  vi.unstubAllGlobals()
  ;(globalThis as any).browser = originalBrowser
})

describe("AutoRefreshService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Reset service state
    autoRefreshService.destroy()
  })

  afterEach(() => {
    vi.useRealTimers()
    autoRefreshService.destroy()
  })

  describe("initialize", () => {
    it("should short-circuit if already initialized", async () => {
      vi.mocked(userPreferences.getPreferences).mockResolvedValue({
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          enabled: false,
        },
        preferencesVersion: 5,
      } as UserPreferences)

      await autoRefreshService.initialize()
      await autoRefreshService.initialize() // Second call should short-circuit

      expect(userPreferences.getPreferences).toHaveBeenCalledTimes(1)
    })

    it("should initialize successfully and setup auto refresh", async () => {
      const mockPreferences: UserPreferences = {
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          enabled: true,
          interval: 300,
        },
        preferencesVersion: 5,
      } as UserPreferences

      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences,
      )
      vi.mocked(accountStorage.refreshAllAccounts).mockResolvedValue({
        success: 5,
        failed: 0,
        refreshedCount: 5,
        latestSyncTime: Date.now(),
      })

      await autoRefreshService.initialize()

      expect(autoRefreshService.getStatus().isInitialized).toBe(true)
      expect(userPreferences.getPreferences).toHaveBeenCalled()
    })

    it("should handle initialization errors gracefully", async () => {
      const error = new Error("Initialization failed")

      vi.mocked(userPreferences.getPreferences).mockRejectedValue(error)

      await autoRefreshService.initialize()

      expect(autoRefreshService.getStatus().isInitialized).toBe(false)
    })
  })

  describe("setupAutoRefresh", () => {
    it("should clear existing timer if present", async () => {
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")

      // First setup to create a timer
      const mockPreferences: UserPreferences = {
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          enabled: true,
          interval: 300,
        },
        preferencesVersion: 5,
      } as UserPreferences
      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences,
      )

      await autoRefreshService.setupAutoRefresh()

      // Second setup should clear the first timer
      await autoRefreshService.setupAutoRefresh()

      expect(clearIntervalSpy).toHaveBeenCalled()
      clearIntervalSpy.mockRestore()
    })

    it("should not create timer when auto refresh is disabled", async () => {
      const mockPreferences: UserPreferences = {
        accountAutoRefresh: { ...DEFAULT_ACCOUNT_AUTO_REFRESH, enabled: false },
        preferencesVersion: 5,
      } as UserPreferences

      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences,
      )

      await autoRefreshService.setupAutoRefresh()

      expect(autoRefreshService.getStatus().isRunning).toBe(false)
    })

    it("should create timer and trigger background refresh when enabled", async () => {
      const interval = 300 // 5 minutes
      const notifyFrontendSpy = vi.spyOn(
        autoRefreshService as any,
        "notifyFrontend",
      )

      const mockPreferences: UserPreferences = {
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          enabled: true,
          interval,
        },
        preferencesVersion: 5,
      } as UserPreferences

      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences,
      )
      vi.mocked(accountStorage.refreshAllAccounts).mockResolvedValue({
        success: 2,
        failed: 1,
        refreshedCount: 2,
        latestSyncTime: Date.now(),
      })
      vi.mocked(usageHistoryScheduler.runAfterRefreshSync).mockResolvedValue({
        totals: { success: 2, skipped: 0, error: 0, unsupported: 0 },
        perAccount: [],
      })

      await autoRefreshService.setupAutoRefresh()

      expect(autoRefreshService.getStatus().isRunning).toBe(true)
      await vi.advanceTimersByTimeAsync(interval * 1000)

      expect(accountStorage.refreshAllAccounts).toHaveBeenCalledWith(false, {
        protectionBypassExecution: expect.objectContaining({
          version: 2,
          kind: "automatic",
          feature: "account_refresh",
          trigger: "scheduled",
          surface: "background",
        }),
      })
      expect(usageHistoryScheduler.runAfterRefreshSync).toHaveBeenCalledTimes(1)
      expect(notifyFrontendSpy).toHaveBeenCalledWith("refresh_completed", {
        success: 2,
        failed: 1,
        refreshedCount: 2,
        latestSyncTime: expect.any(Number),
      })
      notifyFrontendSpy.mockRestore()

      // Clean up timer to avoid hanging
      autoRefreshService.stopAutoRefresh()
    })

    it("should report refresh errors without triggering usage-history sync", async () => {
      const interval = 60
      const notifyFrontendSpy = vi.spyOn(
        autoRefreshService as any,
        "notifyFrontend",
      )
      const mockPreferences: UserPreferences = {
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          enabled: true,
          interval,
        },
        preferencesVersion: 5,
      } as UserPreferences

      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences,
      )
      vi.mocked(accountStorage.refreshAllAccounts).mockRejectedValue(
        new Error("background failed"),
      )

      await autoRefreshService.setupAutoRefresh()
      await vi.advanceTimersByTimeAsync(interval * 1000)

      expect(usageHistoryScheduler.runAfterRefreshSync).not.toHaveBeenCalled()
      expect(notifyFrontendSpy).toHaveBeenCalledWith("refresh_error", {
        error: "Error: background failed",
      })
      notifyFrontendSpy.mockRestore()
    })

    it("should propagate setup errors", async () => {
      const error = new Error("Setup failed")

      vi.mocked(userPreferences.getPreferences).mockRejectedValue(error)

      await expect(autoRefreshService.setupAutoRefresh()).rejects.toThrow(error)

      expect(autoRefreshService.getStatus().isRunning).toBe(false)
    })

    it("preserves a running timer when reloading preferences fails", async () => {
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")
      vi.mocked(userPreferences.getPreferences)
        .mockResolvedValueOnce({
          accountAutoRefresh: {
            ...DEFAULT_ACCOUNT_AUTO_REFRESH,
            enabled: true,
            interval: 300,
          },
          preferencesVersion: 5,
        } as UserPreferences)
        .mockRejectedValueOnce(new Error("preferences unavailable"))

      await autoRefreshService.setupAutoRefresh()
      const statusBeforeReload = autoRefreshService.getStatus()

      await expect(autoRefreshService.setupAutoRefresh()).rejects.toThrow(
        "preferences unavailable",
      )

      expect(statusBeforeReload.isRunning).toBe(true)
      expect(autoRefreshService.getStatus().isRunning).toBe(true)
      expect(clearIntervalSpy).not.toHaveBeenCalled()
      clearIntervalSpy.mockRestore()
    })

    it("does not start a timer for invalid persisted intervals", async () => {
      vi.mocked(userPreferences.getPreferences).mockResolvedValue({
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          enabled: true,
          interval: 0,
        },
        preferencesVersion: 5,
      } as UserPreferences)

      await expect(autoRefreshService.setupAutoRefresh()).rejects.toThrow(
        "Invalid auto-refresh interval",
      )

      expect(autoRefreshService.getStatus().isRunning).toBe(false)
    })
  })

  describe("refreshNow", () => {
    it("should call refreshAllAccounts with force=true and return result", async () => {
      const mockResult = {
        success: 5,
        failed: 0,
        refreshedCount: 5,
        latestSyncTime: Date.now(),
      }

      vi.mocked(accountStorage.refreshAllAccounts).mockResolvedValue(mockResult)

      const result = await autoRefreshService.refreshNow(refreshAllExecution)

      expect(accountStorage.refreshAllAccounts).toHaveBeenCalledWith(true, {
        protectionBypassExecution: refreshAllExecution,
      })
      expect(result).toEqual(mockResult)
    })

    it("should propagate errors from refreshAllAccounts", async () => {
      const error = new Error("Refresh failed")

      vi.mocked(accountStorage.refreshAllAccounts).mockRejectedValue(error)

      await expect(
        autoRefreshService.refreshNow(refreshAllExecution),
      ).rejects.toThrow(error)
    })
  })

  describe("stopAutoRefresh", () => {
    it("should clear timer and update status", async () => {
      // Setup a timer first
      const mockPreferences: UserPreferences = {
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          enabled: true,
          interval: 300,
        },
        preferencesVersion: 5,
      } as UserPreferences
      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences,
      )

      await autoRefreshService.setupAutoRefresh()
      expect(autoRefreshService.getStatus().isRunning).toBe(true)

      // Stop the timer
      autoRefreshService.stopAutoRefresh()

      expect(autoRefreshService.getStatus().isRunning).toBe(false)
    })

    it("should handle stopping when no timer exists", () => {
      autoRefreshService.stopAutoRefresh()

      expect(autoRefreshService.getStatus().isRunning).toBe(false)
    })
  })

  describe("updateSettings", () => {
    it("should save preferences and reconfigure timer", async () => {
      const updates = { accountAutoRefresh: { enabled: false, interval: 600 } }

      vi.mocked(userPreferences.savePreferences).mockResolvedValue(
        preferenceWriteSuccess(),
      )
      vi.mocked(userPreferences.getPreferences).mockResolvedValue({
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          ...updates.accountAutoRefresh,
        },
        preferencesVersion: 5,
      } as UserPreferences)

      await autoRefreshService.updateSettings(updates)

      expect(userPreferences.savePreferences).toHaveBeenCalledWith(updates)
    })

    it("should propagate update errors", async () => {
      const error = new Error("Update failed")
      const updates = { accountAutoRefresh: { enabled: true } }

      vi.mocked(userPreferences.savePreferences).mockRejectedValue(error)

      await expect(autoRefreshService.updateSettings(updates)).rejects.toThrow(
        error,
      )
    })
  })

  describe("notifyFrontend", () => {
    beforeEach(() => {
      mockSendMessage.mockClear()
    })

    it("should send message successfully", () => {
      const testData = { type: "test", data: "result" }

      mockSendMessage.mockResolvedValue(undefined)

      // Access private method through prototype
      const service = autoRefreshService as any
      service.notifyFrontend("refresh_completed", testData)

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "AUTO_REFRESH_UPDATE",
        payload: { type: "refresh_completed", data: testData },
      })
    })

    it("should suppress receiving end does not exist error", () => {
      const error = new Error("receiving end does not exist")

      mockSendMessage.mockRejectedValue(error)

      const service = autoRefreshService as any
      service.notifyFrontend("refresh_completed", {})

      // The catch handler should suppress this specific error
      expect(mockSendMessage).toHaveBeenCalled()
    })

    it("should log other runtime errors", () => {
      const error = new Error("Other runtime error")

      mockSendMessage.mockRejectedValue(error)

      const service = autoRefreshService as any
      service.notifyFrontend("refresh_completed", {})

      expect(mockSendMessage).toHaveBeenCalled()
    })

    it("should handle try-catch errors gracefully", () => {
      // Make sendMessage throw synchronously to trigger the outer catch
      mockSendMessage.mockImplementation(() => {
        throw new Error("Unexpected error")
      })

      const service = autoRefreshService as any
      expect(() =>
        service.notifyFrontend("refresh_completed", {}),
      ).not.toThrow()
    })
  })

  describe("getStatus", () => {
    it("should return current status", () => {
      const status = autoRefreshService.getStatus()

      expect(status).toEqual({
        isRunning: false,
        isInitialized: false,
      })
    })
  })

  describe("destroy", () => {
    it("should stop timer and reset initialization", () => {
      autoRefreshService.destroy()

      expect(autoRefreshService.getStatus().isRunning).toBe(false)
      expect(autoRefreshService.getStatus().isInitialized).toBe(false)
    })
  })
})

describe("auto-refresh typed message resolvers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    autoRefreshService.destroy()
  })

  describe("autoRefresh:setup action", () => {
    it("should setup auto refresh and send success response", async () => {
      const mockPreferences: UserPreferences = {
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          enabled: true,
          interval: 300,
        },
        preferencesVersion: 5,
      } as UserPreferences
      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences,
      )

      const response = await resolveAutoRefreshSetupMessage()

      expect(autoRefreshService.getStatus().isRunning).toBe(true)
      expect(response).toEqual({ success: true, data: undefined })
    })

    it("should return a failure response when setup cannot load preferences", async () => {
      const error = new Error("Setup failed")
      vi.mocked(userPreferences.getPreferences).mockRejectedValue(error)

      const response = await resolveAutoRefreshSetupMessage()

      expect(response).toEqual({
        success: false,
        error: "Error: Setup failed",
      })
    })

    it("should return a failure response when setup sees an invalid interval", async () => {
      vi.mocked(userPreferences.getPreferences).mockResolvedValue({
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          enabled: true,
          interval: Number.NaN,
        },
        preferencesVersion: 5,
      } as UserPreferences)

      const response = await resolveAutoRefreshSetupMessage()

      expect(response).toEqual({
        success: false,
        error: "Error: Invalid auto-refresh interval",
      })
    })
  })

  describe("autoRefresh:refreshNow action", () => {
    it("should refresh now and send result", async () => {
      const mockResult = {
        success: 3,
        failed: 2,
        refreshedCount: 3,
        latestSyncTime: Date.now(),
      }
      vi.mocked(accountStorage.refreshAllAccounts).mockResolvedValue(mockResult)

      const response = await resolveAutoRefreshRefreshNowMessage({
        protectionBypassExecution: refreshAllExecution,
      })

      expect(accountStorage.refreshAllAccounts).toHaveBeenCalledWith(true, {
        protectionBypassExecution: refreshAllExecution,
      })
      expect(response).toEqual({
        success: true,
        data: mockResult,
      })
    })

    it("should handle refresh errors", async () => {
      const error = new Error("Refresh failed")
      vi.mocked(accountStorage.refreshAllAccounts).mockRejectedValue(error)

      const response = await resolveAutoRefreshRefreshNowMessage({
        protectionBypassExecution: refreshAllExecution,
      })

      expect(response).toEqual({
        success: false,
        error: "Error: Refresh failed",
      })
    })

    it("should reject missing execution at the runtime boundary", async () => {
      const response = await resolveAutoRefreshRefreshNowMessage(undefined)

      expect(response).toEqual({
        success: false,
        error: "Invalid protection bypass execution",
      })
      expect(accountStorage.refreshAllAccounts).not.toHaveBeenCalled()
    })

    it.each([
      null,
      {
        version: 1,
        kind: "user_command",
        command: "refresh_all_accounts",
        surface: "options",
      },
      {
        version: 2,
        kind: "user_command",
        command: "unknown",
        surface: "options",
      },
      {
        version: 2,
        kind: "automatic",
        feature: "unknown",
        trigger: "scheduled",
        surface: "background",
      },
    ])("should reject malformed execution metadata: %j", async (execution) => {
      const response = await resolveAutoRefreshRefreshNowMessage({
        protectionBypassExecution: execution as any,
      })

      expect(response).toEqual({
        success: false,
        error: "Invalid protection bypass execution",
      })
      expect(accountStorage.refreshAllAccounts).not.toHaveBeenCalled()
    })

    it("should reject a well-formed command from another workflow", async () => {
      const response = await resolveAutoRefreshRefreshNowMessage({
        protectionBypassExecution: {
          version: 2,
          kind: "user_command",
          command: "manual_checkin",
          surface: "options",
        },
      })

      expect(response).toEqual({
        success: false,
        error: "Invalid protection bypass execution",
      })
      expect(accountStorage.refreshAllAccounts).not.toHaveBeenCalled()
    })
  })

  describe("autoRefresh:stop action", () => {
    it("should stop auto refresh and send success response", async () => {
      const response = await resolveAutoRefreshStopMessage()

      expect(autoRefreshService.getStatus().isRunning).toBe(false)
      expect(response).toEqual({ success: true, data: undefined })
    })
  })

  describe("autoRefresh:updateSettings action", () => {
    it("should update settings and send success response", async () => {
      const settings = { accountAutoRefresh: { enabled: false, interval: 600 } }
      vi.mocked(userPreferences.savePreferences).mockResolvedValue(
        preferenceWriteSuccess(),
      )
      vi.mocked(userPreferences.getPreferences).mockResolvedValue({
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          ...settings.accountAutoRefresh,
        },
        preferencesVersion: 5,
      } as UserPreferences)

      const response = await resolveAutoRefreshUpdateSettingsMessage({
        settings,
      })

      expect(userPreferences.savePreferences).toHaveBeenCalledWith(settings)
      expect(response).toEqual({ success: true, data: undefined })
    })

    it("should return a failure response when update cannot save preferences", async () => {
      const error = new Error("Update failed")
      const settings = { accountAutoRefresh: { enabled: true } }
      vi.mocked(userPreferences.savePreferences).mockRejectedValue(error)

      const response = await resolveAutoRefreshUpdateSettingsMessage({
        settings,
      })

      expect(response).toEqual({
        success: false,
        error: "Error: Update failed",
      })
    })
  })

  describe("autoRefresh:getStatus action", () => {
    it("should return current status", async () => {
      const response = await resolveAutoRefreshGetStatusMessage()

      expect(response).toEqual({
        success: true,
        data: {
          isRunning: false,
          isInitialized: false,
        },
      })
    })
  })

  it("registers typed listeners once and forwards validated plain UI intent", async () => {
    setupAutoRefreshMessagingListeners()
    setupAutoRefreshMessagingListeners()

    expect(mockOnAutoRefreshMessage).toHaveBeenCalledTimes(5)
    expect(mockOnAutoRefreshMessage).toHaveBeenNthCalledWith(
      1,
      AutoRefreshMessageTypes.Setup,
      expect.any(Function),
    )
    expect(mockOnAutoRefreshMessage).toHaveBeenNthCalledWith(
      2,
      AutoRefreshMessageTypes.RefreshNow,
      expect.any(Function),
    )
    expect(mockOnAutoRefreshMessage).toHaveBeenNthCalledWith(
      3,
      AutoRefreshMessageTypes.Stop,
      expect.any(Function),
    )
    expect(mockOnAutoRefreshMessage).toHaveBeenNthCalledWith(
      4,
      AutoRefreshMessageTypes.UpdateSettings,
      expect.any(Function),
    )
    expect(mockOnAutoRefreshMessage).toHaveBeenNthCalledWith(
      5,
      AutoRefreshMessageTypes.GetStatus,
      expect.any(Function),
    )

    const registeredHandlers = mockOnAutoRefreshMessage.mock
      .calls as unknown as Array<
      [string, (message: unknown) => Promise<unknown>]
    >
    const refreshHandler = registeredHandlers.find(
      ([type]) => type === AutoRefreshMessageTypes.RefreshNow,
    )?.[1]
    expect(refreshHandler).toBeTypeOf("function")
    vi.mocked(userPreferences.getPreferencesStrict).mockResolvedValue(
      DEFAULT_PREFERENCES,
    )
    const sender = { url: "chrome-extension://test/options.html" } as any
    const { protectionBypassCoordinator } = await import(
      "~/entrypoints/background/protectionBypassCoordinator"
    )
    const execution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
    )
    const authorizeDecisions: unknown[] = []
    mockExecuteAuthorizedTempContextTask.mockImplementation(
      async (_task, _source, authorizeAtAcquire, sendResponse) => {
        const decision = await authorizeAtAcquire()
        authorizeDecisions.push(decision)
        sendResponse({ success: decision.kind === "allowed" })
      },
    )
    vi.mocked(accountStorage.refreshAllAccounts).mockImplementation(
      async (_force, options) => {
        const response = await protectionBypassCoordinator.execute({
          task: {
            kind: "api_fallback_fetch",
            params: {
              originUrl: "https://example.invalid",
              fetchUrl: "https://example.invalid/api/account",
              requestId: "auto-refresh-continuation",
            },
          },
          execution: options?.protectionBypassExecution,
        } as any)
        if (!(response as any)?.success)
          throw new Error("Coordinator denied task")
        return {
          success: 1,
          failed: 0,
          refreshedCount: 1,
          latestSyncTime: Date.now(),
        }
      },
    )

    await expect(
      refreshHandler!({
        data: { protectionBypassExecution: execution },
        sender,
      } as any),
    ).resolves.toMatchObject({ success: true })
    expect(accountStorage.refreshAllAccounts).toHaveBeenCalledWith(true, {
      protectionBypassExecution: execution,
      tempWindowRequestSource: "options",
    })
    expect(authorizeDecisions).toEqual([
      expect.objectContaining({
        kind: "allowed",
        feature: "account_refresh",
        surface: "options",
      }),
    ])
    await expect(
      refreshHandler!({
        data: {
          protectionBypassExecution: {
            version: 2,
            kind: "user_command",
            command: "unknown",
            surface: "options",
          },
        },
      } as any),
    ).resolves.toEqual({
      success: false,
      error: "Invalid protection bypass execution",
    })
    await expect(
      refreshHandler!({
        data: {
          protectionBypassExecution: {
            version: 2,
            kind: "user_command",
            command: "manual_checkin",
            surface: "options",
          },
        },
      } as any),
    ).resolves.toEqual({
      success: false,
      error: "Invalid protection bypass execution",
    })
    expect(accountStorage.refreshAllAccounts).toHaveBeenCalledTimes(1)
  })
})
