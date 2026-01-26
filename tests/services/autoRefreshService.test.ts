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
import { accountStorage } from "~/services/accountStorage"
import {
  autoRefreshService,
  handleAutoRefreshMessage,
} from "~/services/autoRefreshService"
import type { UserPreferences } from "~/services/userPreferences"
import { userPreferences } from "~/services/userPreferences"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"

// Mock dependencies
vi.mock("~/utils/error", () => ({
  getErrorMessage: vi.fn((error) => `${String(error)}`),
}))

vi.mock("~/services/accountStorage", () => ({
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
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      await autoRefreshService.initialize()
      await autoRefreshService.initialize() // Second call should short-circuit

      expect(consoleSpy).toHaveBeenCalledWith("[AutoRefresh] 服务已初始化")
      expect(userPreferences.getPreferences).toHaveBeenCalledTimes(1)

      consoleSpy.mockRestore()
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
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const error = new Error("Initialization failed")

      vi.mocked(userPreferences.getPreferences).mockRejectedValue(error)

      await autoRefreshService.initialize()

      // setupAutoRefresh is called by initialize and logs the error
      expect(consoleSpy).toHaveBeenCalledWith(
        "[AutoRefresh] 设置自动刷新失败:",
        error,
      )
      expect(autoRefreshService.getStatus().isInitialized).toBe(true) // Still sets isInitialized = true even on error

      consoleSpy.mockRestore()
    })
  })

  describe("setupAutoRefresh", () => {
    it("should clear existing timer if present", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

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

      expect(consoleSpy).toHaveBeenCalledWith("[AutoRefresh] 已清除现有定时器")

      consoleSpy.mockRestore()
    })

    it("should not create timer when auto refresh is disabled", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      const mockPreferences: UserPreferences = {
        accountAutoRefresh: { ...DEFAULT_ACCOUNT_AUTO_REFRESH, enabled: false },
        preferencesVersion: 5,
      } as UserPreferences

      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences,
      )

      await autoRefreshService.setupAutoRefresh()

      expect(consoleSpy).toHaveBeenCalledWith("[AutoRefresh] 自动刷新已关闭")
      expect(autoRefreshService.getStatus().isRunning).toBe(false)

      consoleSpy.mockRestore()
    })

    it("should create timer and trigger background refresh when enabled", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
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

      expect(consoleSpy).toHaveBeenCalledWith(
        `[AutoRefresh] 自动刷新已启动，间隔: ${interval}秒`,
      )
      expect(autoRefreshService.getStatus().isRunning).toBe(true)

      // Clean up timer to avoid hanging
      autoRefreshService.stopAutoRefresh()

      consoleSpy.mockRestore()
    })

    it("should handle setup errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const error = new Error("Setup failed")

      vi.mocked(userPreferences.getPreferences).mockRejectedValue(error)

      await autoRefreshService.setupAutoRefresh()

      expect(consoleSpy).toHaveBeenCalledWith(
        "[AutoRefresh] 设置自动刷新失败:",
        error,
      )
      expect(autoRefreshService.getStatus().isRunning).toBe(false)

      consoleSpy.mockRestore()
    })
  })

  describe("refreshNow", () => {
    it("should call refreshAllAccounts with force=true and return result", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
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
      expect(consoleSpy).toHaveBeenCalledWith(
        `[AutoRefresh] 立即刷新完成 - 成功: ${mockResult.success}, 失败: ${mockResult.failed}`,
      )

      consoleSpy.mockRestore()
    })

    it("should propagate errors from refreshAllAccounts", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const error = new Error("Refresh failed")

      vi.mocked(accountStorage.refreshAllAccounts).mockRejectedValue(error)

      await expect(autoRefreshService.refreshNow()).rejects.toThrow(error)
      expect(consoleSpy).toHaveBeenCalledWith(
        "[AutoRefresh] 立即刷新失败:",
        error,
      )

      consoleSpy.mockRestore()
    })
  })

  describe("stopAutoRefresh", () => {
    it("should clear timer and update status", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

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

      expect(consoleSpy).toHaveBeenCalledWith("[AutoRefresh] 自动刷新已停止")
      expect(autoRefreshService.getStatus().isRunning).toBe(false)

      consoleSpy.mockRestore()
    })

    it("should handle stopping when no timer exists", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      autoRefreshService.stopAutoRefresh()

      expect(autoRefreshService.getStatus().isRunning).toBe(false)
      // Should not log anything if no timer was running
      expect(consoleSpy).not.toHaveBeenCalledWith(
        "[AutoRefresh] 自动刷新已停止",
      )

      consoleSpy.mockRestore()
    })
  })

  describe("updateSettings", () => {
    it("should save preferences and reconfigure timer", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
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
      expect(consoleSpy).toHaveBeenCalledWith(
        "[AutoRefresh] 设置已更新:",
        updates,
      )

      consoleSpy.mockRestore()
    })

    it("should handle update errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const error = new Error("Update failed")
      const updates = { accountAutoRefresh: { enabled: true } }

      vi.mocked(userPreferences.savePreferences).mockRejectedValue(error)

      await autoRefreshService.updateSettings(updates)

      expect(consoleSpy).toHaveBeenCalledWith(
        "[AutoRefresh] 更新设置失败:",
        error,
      )

      consoleSpy.mockRestore()
    })
  })

  describe("notifyFrontend", () => {
    beforeEach(() => {
      mockSendMessage.mockClear()
    })

    it("should send message successfully", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      const testData = { type: "test", data: "result" }

      mockSendMessage.mockResolvedValue(undefined)

      // Access private method through prototype
      const service = autoRefreshService as any
      service.notifyFrontend("refresh_completed", testData)

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "AUTO_REFRESH_UPDATE",
        payload: { type: "refresh_completed", data: testData },
      })

      consoleSpy.mockRestore()
    })

    it("should suppress receiving end does not exist error", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      const error = new Error("receiving end does not exist")

      mockSendMessage.mockRejectedValue(error)

      const service = autoRefreshService as any
      service.notifyFrontend("refresh_completed", {})

      // The catch handler should suppress this specific error
      expect(mockSendMessage).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it("should log other runtime errors", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const error = new Error("Other runtime error")

      mockSendMessage.mockRejectedValue(error)

      const service = autoRefreshService as any
      service.notifyFrontend("refresh_completed", {})

      expect(mockSendMessage).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it("should handle try-catch errors gracefully", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      // Make sendMessage throw synchronously to trigger the outer catch
      mockSendMessage.mockImplementation(() => {
        throw new Error("Unexpected error")
      })

      const service = autoRefreshService as any
      service.notifyFrontend("refresh_completed", {})

      expect(consoleSpy).toHaveBeenCalledWith(
        "[AutoRefresh] 发送消息异常，可能前端未打开",
      )

      consoleSpy.mockRestore()
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
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      autoRefreshService.destroy()

      expect(autoRefreshService.getStatus().isRunning).toBe(false)
      expect(autoRefreshService.getStatus().isInitialized).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith("[AutoRefresh] 服务已销毁")

      consoleSpy.mockRestore()
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
