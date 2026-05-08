import { act, fireEvent, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import TaskNotificationSettings from "~/features/BasicSettings/components/tabs/Notifications/TaskNotificationSettings"
import { OPTIONAL_PERMISSION_IDS } from "~/services/permissions/permissionManager"
import { DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES } from "~/types/siteAnnouncements"
import {
  DEFAULT_TASK_NOTIFICATION_PREFERENCES,
  TASK_NOTIFICATION_CHANNELS,
  TASK_NOTIFICATION_TASKS,
  type TaskNotificationPreferences,
} from "~/types/taskNotifications"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  hasPermissionMock,
  onOptionalPermissionsChangedMock,
  requestPermissionMock,
  sendRuntimeMessageMock,
  showResultToastMock,
  taskNotificationsMock,
  showUpdateToastMock,
  updateSiteAnnouncementNotificationsMock,
  updateTaskNotificationsMock,
} = vi.hoisted(() => ({
  hasPermissionMock: vi.fn(),
  onOptionalPermissionsChangedMock: vi.fn(),
  requestPermissionMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  showResultToastMock: vi.fn(),
  taskNotificationsMock: {
    current: undefined as TaskNotificationPreferences | undefined,
  },
  showUpdateToastMock: vi.fn(),
  updateSiteAnnouncementNotificationsMock: vi.fn(),
  updateTaskNotificationsMock: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    siteAnnouncementNotifications: DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
    taskNotifications:
      taskNotificationsMock.current ?? DEFAULT_TASK_NOTIFICATION_PREFERENCES,
    updateSiteAnnouncementNotifications:
      updateSiteAnnouncementNotificationsMock,
    updateTaskNotifications: updateTaskNotificationsMock,
  }),
}))

vi.mock("~/services/permissions/permissionManager", () => ({
  OPTIONAL_PERMISSION_IDS: {
    Notifications: "notifications",
  },
  hasPermission: hasPermissionMock,
  onOptionalPermissionsChanged: onOptionalPermissionsChangedMock,
  requestPermission: requestPermissionMock,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  }
})

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: (...args: unknown[]) => showResultToastMock(...args),
  showUpdateToast: (...args: unknown[]) => showUpdateToastMock(...args),
}))

describe("TaskNotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionMock.mockResolvedValue(false)
    onOptionalPermissionsChangedMock.mockReturnValue(() => {})
    requestPermissionMock.mockResolvedValue(true)
    sendRuntimeMessageMock.mockResolvedValue({ success: true })
    taskNotificationsMock.current = structuredClone(
      DEFAULT_TASK_NOTIFICATION_PREFERENCES,
    )
    updateSiteAnnouncementNotificationsMock.mockResolvedValue(true)
    updateTaskNotificationsMock.mockResolvedValue(true)
  })

  it("renders permission controls and requests notification permission", async () => {
    render(<TaskNotificationSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findByText("settings:taskNotifications.permission.request"),
    ).toBeInTheDocument()
    screen
      .getAllByRole("button", {
        name: "settings:taskNotifications.test.action",
      })
      .forEach((button) => expect(button).toBeDisabled())

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:taskNotifications.permission.request",
      }),
    )

    await waitFor(() => {
      expect(requestPermissionMock).toHaveBeenCalledWith(
        OPTIONAL_PERMISSION_IDS.Notifications,
      )
    })

    expect(showResultToastMock).toHaveBeenCalledWith(
      true,
      "settings:taskNotifications.permission.requestSuccess",
      "settings:taskNotifications.permission.requestFailed",
    )
  })

  it("refreshes permission status when optional permissions change", async () => {
    let permissionsChangedHandler: (() => void | Promise<void>) | undefined
    hasPermissionMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    onOptionalPermissionsChangedMock.mockImplementation((handler) => {
      permissionsChangedHandler = handler
      return () => {}
    })

    render(<TaskNotificationSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findByText("settings:taskNotifications.permission.request"),
    ).toBeInTheDocument()

    await act(async () => {
      await permissionsChangedHandler?.()
    })

    await waitFor(() => {
      expect(
        screen.queryByText("settings:taskNotifications.permission.request"),
      ).not.toBeInTheDocument()
    })
  })

  it("sends a browser test notification and reports runtime failures", async () => {
    hasPermissionMock.mockResolvedValue(true)
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("runtime failed"))

    render(<TaskNotificationSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await screen.findByText("settings:taskNotifications.channels.browser.title")
    const browserChannel = document.getElementById(
      "task-notifications-channel-browser",
    )
    if (!browserChannel) {
      throw new Error("Expected browser channel settings row")
    }
    const testButton = within(browserChannel).getByRole("button", {
      name: "settings:taskNotifications.test.action",
    })

    fireEvent.click(testButton)

    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Browser,
      })
    })

    expect(showResultToastMock).toHaveBeenCalledWith({
      success: true,
      message: undefined,
      successFallback: "settings:taskNotifications.test.sent",
      errorFallback: "settings:taskNotifications.test.failed",
    })

    fireEvent.click(testButton)

    await waitFor(() => {
      expect(showResultToastMock).toHaveBeenCalledWith({
        success: false,
        message: "runtime failed",
        errorFallback: "settings:taskNotifications.test.failed",
      })
    })
  })

  it("sends Telegram and webhook test notifications through their own channels", async () => {
    hasPermissionMock.mockResolvedValue(false)
    taskNotificationsMock.current = {
      ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
      channels: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
        [TASK_NOTIFICATION_CHANNELS.Telegram]: {
          enabled: true,
          botToken: "telegram-token",
          chatId: "-1001234567890",
        },
        [TASK_NOTIFICATION_CHANNELS.Webhook]: {
          enabled: true,
          url: "https://hooks.example.com/all-api-hub",
        },
      },
    }

    render(<TaskNotificationSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await screen.findByText(
      "settings:taskNotifications.channels.telegram.title",
    )
    const telegramChannel = document.getElementById(
      "task-notifications-channel-telegram",
    )
    const webhookChannel = document.getElementById(
      "task-notifications-channel-webhook",
    )
    if (!telegramChannel || !webhookChannel) {
      throw new Error("Expected third-party channel settings rows")
    }

    const botTokenInput = within(telegramChannel).getByLabelText(
      "settings:taskNotifications.channels.telegram.botToken",
    )
    expect(botTokenInput).toHaveAttribute("type", "password")

    fireEvent.click(
      within(telegramChannel).getByRole("button", {
        name: "keyManagement:actions.showKey",
      }),
    )
    expect(botTokenInput).toHaveAttribute("type", "text")

    fireEvent.click(
      within(telegramChannel).getByRole("button", {
        name: "settings:taskNotifications.test.action",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Telegram,
      })
    })

    fireEvent.click(
      within(webhookChannel).getByRole("button", {
        name: "settings:taskNotifications.test.action",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Webhook,
      })
    })
  })

  it("updates the global switch, announcement switch, and per-task switch through the preferences context", async () => {
    hasPermissionMock.mockResolvedValue(true)

    render(<TaskNotificationSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const globalTaskNotifications = (
      await screen.findByText("settings:taskNotifications.enable")
    ).closest('[id="task-notifications-enabled"]')
    const globalSwitch = globalTaskNotifications?.querySelector(
      '[role="switch"]',
    ) as HTMLElement | null
    const autoCheckinTask = screen
      .getByText("settings:taskNotifications.tasks.autoCheckin")
      .closest('[id="task-notifications-autoCheckin"]')
    const autoCheckinSwitch = autoCheckinTask?.querySelector(
      '[role="switch"]',
    ) as HTMLElement | null
    const siteAnnouncementNotifications = screen
      .getByText("settings:taskNotifications.siteAnnouncements.enable")
      .closest('[id="task-notifications-site-announcements"]')
    const siteAnnouncementSwitch = siteAnnouncementNotifications?.querySelector(
      '[role="switch"]',
    ) as HTMLElement | null

    expect(globalSwitch).not.toBeNull()
    expect(autoCheckinSwitch).not.toBeNull()
    expect(siteAnnouncementSwitch).not.toBeNull()

    fireEvent.click(globalSwitch!)
    fireEvent.click(autoCheckinSwitch!)
    fireEvent.click(siteAnnouncementSwitch!)

    await waitFor(() => {
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        enabled: false,
      })
    })

    expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
      tasks: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.tasks,
        [TASK_NOTIFICATION_TASKS.AutoCheckin]: false,
      },
    })
    expect(updateSiteAnnouncementNotificationsMock).toHaveBeenCalledWith({
      notificationEnabled: false,
    })
    expect(showUpdateToastMock).toHaveBeenCalledWith(
      true,
      "settings:taskNotifications.enable",
    )
    expect(showUpdateToastMock).toHaveBeenCalledWith(
      true,
      "settings:taskNotifications.tasksLabel",
    )
    expect(showUpdateToastMock).toHaveBeenCalledWith(
      true,
      "settings:taskNotifications.siteAnnouncements.enable",
    )
  })
})
