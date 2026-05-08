import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  __resetTaskNotificationServiceForTesting,
  handleTaskNotificationMessage,
  initializeTaskNotificationService,
  notifyTaskResult,
} from "~/services/notifications/taskNotificationService"
import {
  DEFAULT_TASK_NOTIFICATION_PREFERENCES,
  getTaskNotificationId,
  getTaskNotificationStatusFromCounts,
  parseTaskNotificationId,
  TASK_NOTIFICATION_CHANNELS,
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"

const {
  clearNotificationMock,
  createNotificationMock,
  fetchMock,
  getPreferencesMock,
  hasNotificationsAPIMock,
  hasPermissionMock,
  onNotificationClickedMock,
  openOrFocusOptionsMenuItemMock,
} = vi.hoisted(() => ({
  clearNotificationMock: vi.fn(),
  createNotificationMock: vi.fn(),
  fetchMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  hasNotificationsAPIMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  onNotificationClickedMock: vi.fn(),
  openOrFocusOptionsMenuItemMock: vi.fn(),
}))

vi.mock("~/assets/icon.png", () => ({
  default: "icon.png",
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: getPreferencesMock,
  },
}))

vi.mock("~/services/permissions/permissionManager", () => ({
  OPTIONAL_PERMISSION_IDS: {
    Notifications: "notifications",
  },
  hasPermission: hasPermissionMock,
}))

vi.mock("~/utils/browser/browserApi", () => ({
  clearNotification: clearNotificationMock,
  createNotification: createNotificationMock,
  hasNotificationsAPI: hasNotificationsAPIMock,
  onNotificationClicked: onNotificationClickedMock,
}))

vi.mock("~/utils/navigation", () => ({
  openOrFocusOptionsMenuItem: openOrFocusOptionsMenuItemMock,
}))

const translationCalls: Array<{
  key: string
  options?: Record<string, unknown>
}> = []

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string, options?: Record<string, unknown>) => {
    translationCalls.push({ key, options })
    if (key.endsWith(".counts")) {
      return `total ${options?.total} success ${options?.success} failed ${options?.failed} skipped ${options?.skipped}`
    }

    if (typeof options?.task === "string") {
      return `${key}:${options.task}`
    }

    if (key === "settings:taskNotifications.channels.telegram.title") {
      return "Telegram Bot"
    }

    if (key === "settings:taskNotifications.channels.webhook.title") {
      return "Generic webhook"
    }

    if (key === "settings:taskNotifications.test.httpErrorWithDetail") {
      return `${options?.label} returned HTTP ${options?.status}: ${options?.detail}`
    }

    if (key === "settings:taskNotifications.test.httpError") {
      return `${options?.label} returned HTTP ${options?.status}`
    }

    return key
  }),
}))

describe("taskNotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    translationCalls.length = 0
    vi.stubGlobal("fetch", fetchMock)
    __resetTaskNotificationServiceForTesting()
    getPreferencesMock.mockResolvedValue({
      taskNotifications: DEFAULT_TASK_NOTIFICATION_PREFERENCES,
    })
    hasNotificationsAPIMock.mockReturnValue(true)
    hasPermissionMock.mockResolvedValue(true)
    createNotificationMock.mockResolvedValue(
      getTaskNotificationId(TASK_NOTIFICATION_TASKS.AutoCheckin),
    )
    clearNotificationMock.mockResolvedValue(true)
    onNotificationClickedMock.mockReturnValue(vi.fn())
    openOrFocusOptionsMenuItemMock.mockResolvedValue(undefined)
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("skips notifications when the global switch is disabled", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        enabled: false,
      },
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
      }),
    ).resolves.toBe(false)

    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it("skips only the disabled task switch", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        tasks: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.tasks,
          webdavAutoSync: false,
        },
      },
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.WebdavAutoSync,
        status: TASK_NOTIFICATION_STATUSES.Failure,
      }),
    ).resolves.toBe(false)

    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it("skips cleanly when permission is not granted", async () => {
    hasPermissionMock.mockResolvedValueOnce(false)

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
      }),
    ).resolves.toBe(false)

    expect(hasPermissionMock).toHaveBeenCalledWith("notifications")
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it("does not throw when the notifications API is unavailable", async () => {
    hasNotificationsAPIMock.mockReturnValueOnce(false)

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
      }),
    ).resolves.toBe(false)

    expect(hasPermissionMock).not.toHaveBeenCalled()
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it("returns false without throwing when notification creation fails", async () => {
    createNotificationMock.mockResolvedValueOnce(null)

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Failure,
      }),
    ).resolves.toBe(false)
  })

  it("creates localized task result notifications with stable task IDs", async () => {
    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.PartialSuccess,
        counts: {
          total: 3,
          success: 2,
          failed: 1,
        },
      }),
    ).resolves.toBe(true)

    expect(createNotificationMock).toHaveBeenCalledWith(
      getTaskNotificationId(TASK_NOTIFICATION_TASKS.AutoCheckin),
      expect.objectContaining({
        type: "basic",
        iconUrl: "icon.png",
        isClickable: true,
        title:
          "settings:taskNotifications.notification.title.partialSuccess:settings:taskNotifications.tasks.autoCheckin",
        message:
          "settings:taskNotifications.notification.body.partialSuccess:settings:taskNotifications.tasks.autoCheckin total 3 success 2 failed 1 skipped 0",
      }),
    )
  })

  it("omits counts text when no finite counts are provided", async () => {
    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
        counts: {
          total: Number.NaN,
          success: Number.POSITIVE_INFINITY,
        },
      }),
    ).resolves.toBe(true)

    expect(
      translationCalls.some(
        ({ key }) => key === "settings:taskNotifications.notification.counts",
      ),
    ).toBe(false)
    expect(createNotificationMock).toHaveBeenCalledWith(
      getTaskNotificationId(TASK_NOTIFICATION_TASKS.AutoCheckin),
      expect.objectContaining({
        message:
          "settings:taskNotifications.notification.body.success:settings:taskNotifications.tasks.autoCheckin",
      }),
    )
  })

  it("falls back to the localized body when the custom message is blank", async () => {
    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
        message: "   ",
      }),
    ).resolves.toBe(true)

    expect(createNotificationMock).toHaveBeenCalledWith(
      getTaskNotificationId(TASK_NOTIFICATION_TASKS.AutoCheckin),
      expect.objectContaining({
        message:
          "settings:taskNotifications.notification.body.success:settings:taskNotifications.tasks.autoCheckin",
      }),
    )
  })

  it("uses a custom localized title when provided", async () => {
    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.SiteAnnouncements,
        status: TASK_NOTIFICATION_STATUSES.Success,
        title: "Example has new announcements",
        message: "Hello",
      }),
    ).resolves.toBe(true)

    expect(createNotificationMock).toHaveBeenCalledWith(
      getTaskNotificationId(TASK_NOTIFICATION_TASKS.SiteAnnouncements),
      expect.objectContaining({
        title: "Example has new announcements",
        message: "Hello",
      }),
    )
  })

  it("uses default task switch values when stored preferences predate newer task keys", async () => {
    const { siteAnnouncements: _siteAnnouncements, ...legacyTasks } =
      DEFAULT_TASK_NOTIFICATION_PREFERENCES.tasks

    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        enabled: true,
        tasks: legacyTasks,
      },
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.SiteAnnouncements,
        status: TASK_NOTIFICATION_STATUSES.Success,
        title: "Example has new announcements",
        message: "Hello",
      }),
    ).resolves.toBe(true)

    expect(createNotificationMock).toHaveBeenCalledWith(
      getTaskNotificationId(TASK_NOTIFICATION_TASKS.SiteAnnouncements),
      expect.objectContaining({
        title: "Example has new announcements",
      }),
    )
  })

  it("sends Telegram notifications when browser notification permission is missing", async () => {
    hasPermissionMock.mockResolvedValueOnce(false)
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Telegram]: {
            enabled: true,
            botToken: "123456:telegram-token",
            chatId: "-1001234567890",
          },
        },
      },
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
      }),
    ).resolves.toBe(true)

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123456%3Atelegram-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("-1001234567890"),
      }),
    )
  })

  it("posts generic webhook notifications with task metadata", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Browser]: {
            enabled: false,
          },
          [TASK_NOTIFICATION_CHANNELS.Webhook]: {
            enabled: true,
            url: "https://hooks.example.com/all-api-hub",
          },
        },
      },
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.WebdavAutoSync,
        status: TASK_NOTIFICATION_STATUSES.Failure,
        counts: {
          total: 2,
          success: 1,
          failed: 1,
        },
      }),
    ).resolves.toBe(true)

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.example.com/all-api-hub",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: expect.stringContaining('"task":"webdavAutoSync"'),
      }),
    )
  })

  it("returns false when webhook delivery responds with non-OK", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Browser]: {
            enabled: false,
          },
          [TASK_NOTIFICATION_CHANNELS.Webhook]: {
            enabled: true,
            url: "https://hooks.example.com/all-api-hub",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: {
        get: () => "text/plain",
      },
      text: async () => "internal error",
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.WebdavAutoSync,
        status: TASK_NOTIFICATION_STATUSES.Failure,
      }),
    ).resolves.toBe(false)

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.example.com/all-api-hub",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"status":"failure"'),
      }),
    )
  })

  it("returns false when loading preferences throws", async () => {
    getPreferencesMock.mockRejectedValueOnce(new Error("prefs failed"))

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
      }),
    ).resolves.toBe(false)

    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it("opens the mapped settings page when a task notification is clicked", async () => {
    onNotificationClickedMock.mockReturnValueOnce(vi.fn())

    initializeTaskNotificationService()
    const handler = onNotificationClickedMock.mock.calls[0]?.[0] as
      | ((notificationId: string) => void | Promise<void>)
      | undefined
    if (!handler) {
      throw new Error("Expected notification click handler to be registered")
    }

    await handler(getTaskNotificationId(TASK_NOTIFICATION_TASKS.WebdavAutoSync))

    expect(openOrFocusOptionsMenuItemMock).toHaveBeenCalledWith(
      MENU_ITEM_IDS.BASIC,
      { tab: "dataBackup", anchor: "webdav-auto-sync" },
    )
    expect(clearNotificationMock).toHaveBeenCalledWith(
      getTaskNotificationId(TASK_NOTIFICATION_TASKS.WebdavAutoSync),
    )
  })

  it("opens the site announcements page when a site announcement task notification is clicked", async () => {
    initializeTaskNotificationService()
    const handler = onNotificationClickedMock.mock.calls[0]?.[0] as
      | ((notificationId: string) => void | Promise<void>)
      | undefined
    if (!handler) {
      throw new Error("Expected notification click handler to be registered")
    }

    await handler(
      getTaskNotificationId(TASK_NOTIFICATION_TASKS.SiteAnnouncements),
    )

    expect(openOrFocusOptionsMenuItemMock).toHaveBeenCalledWith(
      MENU_ITEM_IDS.SITE_ANNOUNCEMENTS,
      undefined,
    )
    expect(clearNotificationMock).toHaveBeenCalledWith(
      getTaskNotificationId(TASK_NOTIFICATION_TASKS.SiteAnnouncements),
    )
  })

  it("handles test notification runtime messages", async () => {
    const sendResponse = vi.fn()

    await handleTaskNotificationMessage(
      { action: RuntimeActionIds.TaskNotificationsTest },
      sendResponse,
    )

    expect(createNotificationMock).toHaveBeenCalledWith(
      getTaskNotificationId(TASK_NOTIFICATION_TASKS.AutoCheckin),
      expect.objectContaining({
        title: "settings:taskNotifications.test.title",
        message: "settings:taskNotifications.test.message",
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      error: undefined,
    })
  })

  it("does not require the auto-check-in task switch for test notification runtime messages", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        tasks: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.tasks,
          [TASK_NOTIFICATION_TASKS.AutoCheckin]: false,
        },
      },
    })

    await handleTaskNotificationMessage(
      { action: RuntimeActionIds.TaskNotificationsTest },
      sendResponse,
    )

    expect(createNotificationMock).toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      error: undefined,
    })
  })

  it("handles channel-specific test notification runtime messages", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Telegram]: {
            enabled: true,
            botToken: "telegram-token",
            chatId: "123456789",
          },
        },
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Telegram,
      },
      sendResponse,
    )

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottelegram-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("123456789"),
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      error: undefined,
    })
  })

  it("returns Telegram API response descriptions for channel-specific tests", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Telegram]: {
            enabled: true,
            botToken: "telegram-token",
            chatId: "telegram-bot",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        ok: false,
        error_code: 403,
        description: "Forbidden: the bot can't send messages to the bot",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Telegram,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error:
        "Telegram Bot returned HTTP 403: Forbidden: the bot can't send messages to the bot",
    })
  })

  it("returns webhook response text for channel-specific tests", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Webhook]: {
            enabled: true,
            url: "https://hooks.example.com/all-api-hub",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      headers: {
        get: () => "text/plain",
      },
      text: async () => "bad gateway",
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Webhook,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Generic webhook returned HTTP 502: bad gateway",
    })
  })

  it("falls back to a localized HTTP status when response details cannot be read", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Telegram]: {
            enabled: true,
            botToken: "telegram-token",
            chatId: "telegram-bot",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: {
        get: () => "application/json",
      },
      json: async () => {
        throw new Error("invalid json")
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Telegram,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Telegram Bot returned HTTP 429",
    })
  })

  it("reports disabled or unavailable channel-specific test notifications", async () => {
    const disabledChannelResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Webhook]: {
            enabled: false,
            url: "https://hooks.example.com/all-api-hub",
          },
        },
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Webhook,
      },
      disabledChannelResponse,
    )

    expect(disabledChannelResponse).toHaveBeenCalledWith({
      success: false,
      error: "settings:taskNotifications.test.channelDisabled",
    })

    const unavailableBrowserResponse = vi.fn()
    hasNotificationsAPIMock.mockReturnValueOnce(false)

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Browser,
      },
      unavailableBrowserResponse,
    )

    expect(unavailableBrowserResponse).toHaveBeenCalledWith({
      success: false,
      error: "settings:taskNotifications.test.browserFailed",
    })
  })

  it("validates missing and invalid third-party channel configuration", async () => {
    const missingTelegramResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Telegram]: {
            enabled: true,
            botToken: "",
            chatId: "telegram-bot",
          },
        },
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Telegram,
      },
      missingTelegramResponse,
    )

    expect(missingTelegramResponse).toHaveBeenCalledWith({
      success: false,
      error: "settings:taskNotifications.test.telegramMissingConfig",
    })

    const missingWebhookResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Webhook]: {
            enabled: true,
            url: "",
          },
        },
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Webhook,
      },
      missingWebhookResponse,
    )

    expect(missingWebhookResponse).toHaveBeenCalledWith({
      success: false,
      error: "settings:taskNotifications.test.webhookMissingConfig",
    })

    const invalidWebhookResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Webhook]: {
            enabled: true,
            url: "ftp://hooks.example.com/all-api-hub",
          },
        },
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Webhook,
      },
      invalidWebhookResponse,
    )

    expect(invalidWebhookResponse).toHaveBeenCalledWith({
      success: false,
      error: "settings:taskNotifications.test.webhookInvalidUrl",
    })
  })

  it("rejects unknown runtime actions", async () => {
    const sendResponse = vi.fn()

    await handleTaskNotificationMessage(
      { action: "taskNotifications:unknown" },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Unknown action",
    })
  })

  it("ignores invalid notification ids when handling clicks", async () => {
    onNotificationClickedMock.mockReturnValueOnce(undefined)
    initializeTaskNotificationService()
    const handler = onNotificationClickedMock.mock.calls[0]?.[0] as
      | ((notificationId: string) => void | Promise<void>)
      | undefined

    if (!handler) {
      throw new Error("Expected notification click handler to be registered")
    }

    await handler("all-api-hub:task:unknown")

    expect(openOrFocusOptionsMenuItemMock).not.toHaveBeenCalled()
    expect(clearNotificationMock).not.toHaveBeenCalled()
  })

  it("swallows notification click handler failures", async () => {
    openOrFocusOptionsMenuItemMock.mockRejectedValueOnce(
      new Error("open failed"),
    )

    initializeTaskNotificationService()
    const handler = onNotificationClickedMock.mock.calls[0]?.[0] as
      | ((notificationId: string) => void | Promise<void>)
      | undefined

    if (!handler) {
      throw new Error("Expected notification click handler to be registered")
    }

    await handler(getTaskNotificationId(TASK_NOTIFICATION_TASKS.AutoCheckin))
    await Promise.resolve()

    expect(clearNotificationMock).not.toHaveBeenCalled()
  })

  it("does not register the click listener twice", () => {
    initializeTaskNotificationService()
    initializeTaskNotificationService()

    expect(onNotificationClickedMock).toHaveBeenCalledTimes(1)
  })

  it("parses only valid notification ids and derives failure status", () => {
    expect(parseTaskNotificationId("all-api-hub:task:unknown")).toBeNull()
    expect(parseTaskNotificationId("wrong-prefix:autoCheckin")).toBeNull()
    expect(
      getTaskNotificationStatusFromCounts({
        successCount: 0,
        failedCount: 2,
      }),
    ).toBe(TASK_NOTIFICATION_STATUSES.Failure)
  })
})
