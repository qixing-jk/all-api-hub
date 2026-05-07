import { beforeEach, describe, expect, it, vi } from "vitest"

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
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"

const {
  clearNotificationMock,
  createNotificationMock,
  getPreferencesMock,
  hasNotificationsAPIMock,
  hasPermissionMock,
  onNotificationClickedMock,
  openOrFocusOptionsMenuItemMock,
} = vi.hoisted(() => ({
  clearNotificationMock: vi.fn(),
  createNotificationMock: vi.fn(),
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

    return key
  }),
}))

describe("taskNotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    translationCalls.length = 0
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

    expect(createNotificationMock).toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      error: undefined,
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
