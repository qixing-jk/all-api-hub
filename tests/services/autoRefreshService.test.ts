import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  autoRefreshService,
  handleAutoRefreshMessage,
} from "~/services/accounts/autoRefreshService"
import type { UserPreferences } from "~/services/userPreferences"
import { userPreferences } from "~/services/userPreferences"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"

// Mock dependencies.
//
// The project uses the unified logger, which suppresses direct `console.*` output by default in tests.
// These tests focus on behavior (timers, messages, storage calls) rather than console emission.
vi.mock("~/utils/error", () => ({
  getErrorMessage: vi.fn((error) => `${String(error)}`),
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    refreshAllAccounts: vi.fn(),
  },
}))

vi.mock("~/services/userPreferences", () => ({
  userPreferences: {
    getPreferences: vi.fn(),
    savePreferences: vi.fn(),
  },
}))

// Mock browser runtime using vi.stubGlobal like other tests
const mockSendMessage = vi.fn()
const originalBrowser = (globalThis as any).browser
vi.stubGlobal("browser", {
  runtime: {
    sendMessage: mockSendMessage,
  },
})

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

      expect(autoRefreshService.getStatus().isInitialized).toBe(true) // Still sets isInitialized = true even on error
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

      await autoRefreshService.setupAutoRefresh()

      expect(autoRefreshService.getStatus().isRunning).toBe(true)

      // Clean up timer to avoid hanging
      autoRefreshService.stopAutoRefresh()
    })

    it("should handle setup errors gracefully", async () => {
      const error = new Error("Setup failed")

      vi.mocked(userPreferences.getPreferences).mockRejectedValue(error)

      await autoRefreshService.setupAutoRefresh()

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

      const result = await autoRefreshService.refreshNow()

      expect(accountStorage.refreshAllAccounts).toHaveBeenCalledWith(true)
      expect(result).toEqual(mockResult)
    })

    it("should propagate errors from refreshAllAccounts", async () => {
      const error = new Error("Refresh failed")

      vi.mocked(accountStorage.refreshAllAccounts).mockRejectedValue(error)

      await expect(autoRefreshService.refreshNow()).rejects.toThrow(error)
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

      vi.mocked(userPreferences.savePreferences).mockResolvedValue(true)
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

    it("should handle update errors gracefully", async () => {
      const error = new Error("Update failed")
      const updates = { accountAutoRefresh: { enabled: true } }

      vi.mocked(userPreferences.savePreferences).mockRejectedValue(error)

      await autoRefreshService.updateSettings(updates)
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

describe("handleAutoRefreshMessage", () => {
  let mockSendResponse: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockSendResponse = vi.fn()
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

      await handleAutoRefreshMessage(
        { action: RuntimeActionIds.AutoRefreshSetup },
        mockSendResponse,
      )

      expect(autoRefreshService.getStatus().isRunning).toBe(true)
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true })
    })

    it("should handle setup errors gracefully and still send success response", async () => {
      const error = new Error("Setup failed")
      vi.mocked(userPreferences.getPreferences).mockRejectedValue(error)

      await handleAutoRefreshMessage(
        { action: RuntimeActionIds.AutoRefreshSetup },
        mockSendResponse,
      )

      // setupAutoRefresh catches errors internally, so message handler still succeeds
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true })
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

      await handleAutoRefreshMessage(
        { action: RuntimeActionIds.AutoRefreshRefreshNow },
        mockSendResponse,
      )

      expect(accountStorage.refreshAllAccounts).toHaveBeenCalledWith(true)
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        data: mockResult,
      })
    })

    it("should handle refresh errors", async () => {
      const error = new Error("Refresh failed")
      vi.mocked(accountStorage.refreshAllAccounts).mockRejectedValue(error)

      await handleAutoRefreshMessage(
        { action: RuntimeActionIds.AutoRefreshRefreshNow },
        mockSendResponse,
      )

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: "Error: Refresh failed",
      })
    })
  })

  describe("autoRefresh:stop action", () => {
    it("should stop auto refresh and send success response", async () => {
      await handleAutoRefreshMessage(
        { action: RuntimeActionIds.AutoRefreshStop },
        mockSendResponse,
      )

      expect(autoRefreshService.getStatus().isRunning).toBe(false)
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true })
    })
  })

  describe("autoRefresh:updateSettings action", () => {
    it("should update settings and send success response", async () => {
      const settings = { accountAutoRefresh: { enabled: false, interval: 600 } }
      vi.mocked(userPreferences.savePreferences).mockResolvedValue(true)
      vi.mocked(userPreferences.getPreferences).mockResolvedValue({
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          ...settings.accountAutoRefresh,
        },
        preferencesVersion: 5,
      } as UserPreferences)

      await handleAutoRefreshMessage(
        { action: RuntimeActionIds.AutoRefreshUpdateSettings, settings },
        mockSendResponse,
      )

      expect(userPreferences.savePreferences).toHaveBeenCalledWith(settings)
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true })
    })

    it("should handle update errors gracefully and still send success response", async () => {
      const error = new Error("Update failed")
      const settings = { accountAutoRefresh: { enabled: true } }
      vi.mocked(userPreferences.savePreferences).mockRejectedValue(error)

      await handleAutoRefreshMessage(
        { action: RuntimeActionIds.AutoRefreshUpdateSettings, settings },
        mockSendResponse,
      )

      // updateSettings catches errors internally, so message handler still succeeds
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true })
    })
  })

  describe("autoRefresh:getStatus action", () => {
    it("should return current status", async () => {
      await handleAutoRefreshMessage(
        { action: RuntimeActionIds.AutoRefreshGetStatus },
        mockSendResponse,
      )

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          isRunning: false,
          isInitialized: false,
        },
      })
    })
  })

  describe("default action", () => {
    it("should send error response for unknown action", async () => {
      await handleAutoRefreshMessage(
        { action: "unknownAction" },
        mockSendResponse,
      )

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: "未知的操作",
      })
    })
  })
})
