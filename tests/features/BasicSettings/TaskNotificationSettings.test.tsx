import { act, fireEvent, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import TaskNotificationSettings from "~/features/BasicSettings/components/tabs/Notifications/TaskNotificationSettings"
import { OPTIONAL_PERMISSION_IDS } from "~/services/permissions/permissionManager"
import { DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES } from "~/types/siteAnnouncements"
import {
  DEFAULT_TASK_NOTIFICATION_PREFERENCES,
  TASK_NOTIFICATION_CHANNELS,
  TASK_NOTIFICATION_TASKS,
  type TaskNotificationPreferences,
} from "~/types/taskNotifications"
import {
  getDocsTaskNotificationsDingtalkUrl,
  getDocsTaskNotificationsFeishuUrl,
  getDocsTaskNotificationsNtfyUrl,
  getDocsTaskNotificationsWecomUrl,
} from "~/utils/navigation/docsLinks"
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
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_BROWSER,
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
        [TASK_NOTIFICATION_CHANNELS.Feishu]: {
          enabled: true,
          webhookKey: "feishu-webhook-key",
        },
        [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
          enabled: true,
          webhookKey: "dingtalk-access-token",
          secret: "SECdingtalk-secret",
        },
        [TASK_NOTIFICATION_CHANNELS.Wecom]: {
          enabled: true,
          webhookKey: "wecom-webhook-key",
        },
        [TASK_NOTIFICATION_CHANNELS.Ntfy]: {
          enabled: true,
          topicUrl: "https://ntfy.sh/all-api-hub",
          accessToken: "ntfy-token",
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
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_TELEGRAM,
    )
    const feishuChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_FEISHU,
    )
    const dingtalkChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_DINGTALK,
    )
    const wecomChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WECOM,
    )
    const ntfyChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_NTFY,
    )
    const webhookChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WEBHOOK,
    )
    if (
      !telegramChannel ||
      !feishuChannel ||
      !dingtalkChannel ||
      !wecomChannel ||
      !ntfyChannel ||
      !webhookChannel
    ) {
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

    const webhookKeyInput = within(feishuChannel).getByLabelText(
      "settings:taskNotifications.channels.feishu.webhookKey",
    )
    expect(webhookKeyInput).toHaveAttribute("type", "password")
    expect(
      within(feishuChannel).getByRole("link", {
        name: "settings:taskNotifications.channels.feishu.docsLink",
      }),
    ).toHaveAttribute("href", getDocsTaskNotificationsFeishuUrl("en"))

    fireEvent.click(
      within(feishuChannel).getByRole("button", {
        name: "keyManagement:actions.showKey",
      }),
    )
    expect(webhookKeyInput).toHaveAttribute("type", "text")

    fireEvent.click(
      within(feishuChannel).getByRole("button", {
        name: "settings:taskNotifications.test.action",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Feishu,
      })
    })

    const dingtalkWebhookKeyInput = within(dingtalkChannel).getByLabelText(
      "settings:taskNotifications.channels.dingtalk.webhookKey",
    )
    const dingtalkSecretInput = within(dingtalkChannel).getByLabelText(
      "settings:taskNotifications.channels.dingtalk.secret",
    )
    expect(dingtalkWebhookKeyInput).toHaveAttribute("type", "password")
    expect(dingtalkSecretInput).toHaveAttribute("type", "password")
    expect(
      within(dingtalkChannel).getByRole("link", {
        name: "settings:taskNotifications.channels.dingtalk.docsLink",
      }),
    ).toHaveAttribute("href", getDocsTaskNotificationsDingtalkUrl("en"))

    fireEvent.click(
      within(dingtalkChannel).getAllByRole("button", {
        name: "keyManagement:actions.showKey",
      })[0],
    )
    expect(dingtalkWebhookKeyInput).toHaveAttribute("type", "text")

    fireEvent.click(
      within(dingtalkChannel).getByRole("button", {
        name: "settings:taskNotifications.test.action",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Dingtalk,
      })
    })

    const wecomWebhookKeyInput = within(wecomChannel).getByLabelText(
      "settings:taskNotifications.channels.wecom.webhookKey",
    )
    expect(wecomWebhookKeyInput).toHaveAttribute("type", "password")
    expect(
      within(wecomChannel).getByRole("link", {
        name: "settings:taskNotifications.channels.wecom.docsLink",
      }),
    ).toHaveAttribute("href", getDocsTaskNotificationsWecomUrl("en"))

    fireEvent.click(
      within(wecomChannel).getByRole("button", {
        name: "keyManagement:actions.showKey",
      }),
    )
    expect(wecomWebhookKeyInput).toHaveAttribute("type", "text")

    fireEvent.click(
      within(wecomChannel).getByRole("button", {
        name: "settings:taskNotifications.test.action",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Wecom,
      })
    })

    const ntfyAccessTokenInput = within(ntfyChannel).getByLabelText(
      "settings:taskNotifications.channels.ntfy.accessToken",
    )
    expect(ntfyAccessTokenInput).toHaveAttribute("type", "password")
    expect(
      within(ntfyChannel).getByRole("link", {
        name: "settings:taskNotifications.channels.ntfy.docsLink",
      }),
    ).toHaveAttribute("href", getDocsTaskNotificationsNtfyUrl("en"))

    fireEvent.click(
      within(ntfyChannel).getByRole("button", {
        name: "keyManagement:actions.showKey",
      }),
    )
    expect(ntfyAccessTokenInput).toHaveAttribute("type", "text")

    fireEvent.click(
      within(ntfyChannel).getByRole("button", {
        name: "settings:taskNotifications.test.action",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Ntfy,
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

  it("updates channel switches and saves trimmed third-party channel drafts", async () => {
    hasPermissionMock.mockResolvedValue(true)
    taskNotificationsMock.current = {
      ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
      channels: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
        [TASK_NOTIFICATION_CHANNELS.Telegram]: {
          enabled: true,
          botToken: "telegram-token",
          chatId: "-1001234567890",
        },
        [TASK_NOTIFICATION_CHANNELS.Feishu]: {
          enabled: true,
          webhookKey: "feishu-webhook-key",
        },
        [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
          enabled: true,
          webhookKey: "dingtalk-access-token",
          secret: "SECdingtalk-secret",
        },
        [TASK_NOTIFICATION_CHANNELS.Wecom]: {
          enabled: true,
          webhookKey: "wecom-webhook-key",
        },
        [TASK_NOTIFICATION_CHANNELS.Ntfy]: {
          enabled: true,
          topicUrl: "https://ntfy.sh/all-api-hub",
          accessToken: "ntfy-token",
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

    await screen.findByText("settings:taskNotifications.channels.browser.title")
    const browserChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_BROWSER,
    )
    const telegramChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_TELEGRAM,
    )
    const feishuChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_FEISHU,
    )
    const dingtalkChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_DINGTALK,
    )
    const wecomChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WECOM,
    )
    const ntfyChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_NTFY,
    )
    const webhookChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WEBHOOK,
    )
    if (
      !browserChannel ||
      !telegramChannel ||
      !feishuChannel ||
      !dingtalkChannel ||
      !wecomChannel ||
      !ntfyChannel ||
      !webhookChannel
    ) {
      throw new Error("Expected channel settings rows")
    }

    fireEvent.click(within(browserChannel).getByRole("switch"))
    fireEvent.click(within(telegramChannel).getByRole("switch"))
    fireEvent.click(within(feishuChannel).getByRole("switch"))
    fireEvent.click(within(dingtalkChannel).getByRole("switch"))
    fireEvent.click(within(wecomChannel).getByRole("switch"))
    fireEvent.click(within(ntfyChannel).getByRole("switch"))
    fireEvent.click(within(webhookChannel).getByRole("switch"))

    await waitFor(() => {
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Browser]: expect.objectContaining({
            enabled: false,
          }),
        }),
      })
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Telegram]: expect.objectContaining({
            enabled: false,
          }),
        }),
      })
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Webhook]: expect.objectContaining({
            enabled: false,
          }),
        }),
      })
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Feishu]: expect.objectContaining({
            enabled: false,
          }),
        }),
      })
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: expect.objectContaining({
            enabled: false,
          }),
        }),
      })
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Wecom]: expect.objectContaining({
            enabled: false,
          }),
        }),
      })
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Ntfy]: expect.objectContaining({
            enabled: false,
          }),
        }),
      })
    })

    updateTaskNotificationsMock.mockClear()
    const botTokenInput = within(telegramChannel).getByLabelText(
      "settings:taskNotifications.channels.telegram.botToken",
    )
    const chatIdInput = within(telegramChannel).getByLabelText(
      "settings:taskNotifications.channels.telegram.chatId",
    )
    const feishuWebhookKeyInput = within(feishuChannel).getByLabelText(
      "settings:taskNotifications.channels.feishu.webhookKey",
    )
    const dingtalkWebhookKeyInput = within(dingtalkChannel).getByLabelText(
      "settings:taskNotifications.channels.dingtalk.webhookKey",
    )
    const dingtalkSecretInput = within(dingtalkChannel).getByLabelText(
      "settings:taskNotifications.channels.dingtalk.secret",
    )
    const wecomWebhookKeyInput = within(wecomChannel).getByLabelText(
      "settings:taskNotifications.channels.wecom.webhookKey",
    )
    const ntfyTopicUrlInput = within(ntfyChannel).getByLabelText(
      "settings:taskNotifications.channels.ntfy.topicUrl",
    )
    const ntfyAccessTokenInput = within(ntfyChannel).getByLabelText(
      "settings:taskNotifications.channels.ntfy.accessToken",
    )
    const webhookUrlInput = within(webhookChannel).getByLabelText(
      "settings:taskNotifications.channels.webhook.url",
    )

    fireEvent.change(botTokenInput, {
      target: { value: "  next-telegram-token  " },
    })
    fireEvent.blur(botTokenInput)

    await waitFor(() => {
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Telegram]: expect.objectContaining({
            botToken: "next-telegram-token",
            chatId: "-1001234567890",
          }),
        }),
      })
    })

    fireEvent.change(chatIdInput, {
      target: { value: "  -1009876543210  " },
    })
    fireEvent.blur(chatIdInput)

    await waitFor(() => {
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Telegram]: expect.objectContaining({
            botToken: "next-telegram-token",
            chatId: "-1009876543210",
          }),
        }),
      })
    })

    fireEvent.change(feishuWebhookKeyInput, {
      target: { value: "  next-feishu-key  " },
    })
    fireEvent.blur(feishuWebhookKeyInput)

    await waitFor(() => {
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Feishu]: expect.objectContaining({
            webhookKey: "next-feishu-key",
          }),
        }),
      })
    })

    fireEvent.change(dingtalkWebhookKeyInput, {
      target: { value: "  next-dingtalk-token  " },
    })
    fireEvent.blur(dingtalkWebhookKeyInput)

    await waitFor(() => {
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: expect.objectContaining({
            webhookKey: "next-dingtalk-token",
            secret: "SECdingtalk-secret",
          }),
        }),
      })
    })

    fireEvent.change(dingtalkSecretInput, {
      target: { value: "  SECnext-dingtalk-secret  " },
    })
    fireEvent.blur(dingtalkSecretInput)

    await waitFor(() => {
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: expect.objectContaining({
            webhookKey: "next-dingtalk-token",
            secret: "SECnext-dingtalk-secret",
          }),
        }),
      })
    })

    fireEvent.change(wecomWebhookKeyInput, {
      target: { value: "  next-wecom-key  " },
    })
    fireEvent.blur(wecomWebhookKeyInput)

    await waitFor(() => {
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Wecom]: expect.objectContaining({
            webhookKey: "next-wecom-key",
          }),
        }),
      })
    })

    fireEvent.change(ntfyTopicUrlInput, {
      target: { value: "  https://ntfy.sh/next-topic  " },
    })
    fireEvent.blur(ntfyTopicUrlInput)

    await waitFor(() => {
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Ntfy]: expect.objectContaining({
            topicUrl: "https://ntfy.sh/next-topic",
            accessToken: "ntfy-token",
          }),
        }),
      })
    })

    fireEvent.change(ntfyAccessTokenInput, {
      target: { value: "  next-ntfy-token  " },
    })
    fireEvent.blur(ntfyAccessTokenInput)

    await waitFor(() => {
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Ntfy]: expect.objectContaining({
            topicUrl: "https://ntfy.sh/next-topic",
            accessToken: "next-ntfy-token",
          }),
        }),
      })
    })

    fireEvent.change(webhookUrlInput, {
      target: { value: "  https://hooks.example.com/next  " },
    })
    fireEvent.blur(webhookUrlInput)

    await waitFor(() => {
      expect(updateTaskNotificationsMock).toHaveBeenCalledWith({
        channels: expect.objectContaining({
          [TASK_NOTIFICATION_CHANNELS.Webhook]: expect.objectContaining({
            url: "https://hooks.example.com/next",
          }),
        }),
      })
    })
  })

  it("does not save unchanged third-party channel drafts", async () => {
    taskNotificationsMock.current = {
      ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
      channels: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
        [TASK_NOTIFICATION_CHANNELS.Telegram]: {
          enabled: true,
          botToken: "telegram-token",
          chatId: "-1001234567890",
        },
        [TASK_NOTIFICATION_CHANNELS.Feishu]: {
          enabled: true,
          webhookKey: "feishu-webhook-key",
        },
        [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
          enabled: true,
          webhookKey: "dingtalk-access-token",
          secret: "SECdingtalk-secret",
        },
        [TASK_NOTIFICATION_CHANNELS.Wecom]: {
          enabled: true,
          webhookKey: "wecom-webhook-key",
        },
        [TASK_NOTIFICATION_CHANNELS.Ntfy]: {
          enabled: true,
          topicUrl: "https://ntfy.sh/all-api-hub",
          accessToken: "ntfy-token",
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
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_TELEGRAM,
    )
    const feishuChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_FEISHU,
    )
    const dingtalkChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_DINGTALK,
    )
    const wecomChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WECOM,
    )
    const ntfyChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_NTFY,
    )
    const webhookChannel = document.getElementById(
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WEBHOOK,
    )
    if (
      !telegramChannel ||
      !feishuChannel ||
      !dingtalkChannel ||
      !wecomChannel ||
      !ntfyChannel ||
      !webhookChannel
    ) {
      throw new Error("Expected third-party channel settings rows")
    }

    await act(async () => {
      fireEvent.blur(
        within(telegramChannel).getByLabelText(
          "settings:taskNotifications.channels.telegram.botToken",
        ),
      )
      fireEvent.blur(
        within(telegramChannel).getByLabelText(
          "settings:taskNotifications.channels.telegram.chatId",
        ),
      )
      fireEvent.blur(
        within(feishuChannel).getByLabelText(
          "settings:taskNotifications.channels.feishu.webhookKey",
        ),
      )
      fireEvent.blur(
        within(dingtalkChannel).getByLabelText(
          "settings:taskNotifications.channels.dingtalk.webhookKey",
        ),
      )
      fireEvent.blur(
        within(dingtalkChannel).getByLabelText(
          "settings:taskNotifications.channels.dingtalk.secret",
        ),
      )
      fireEvent.blur(
        within(wecomChannel).getByLabelText(
          "settings:taskNotifications.channels.wecom.webhookKey",
        ),
      )
      fireEvent.blur(
        within(ntfyChannel).getByLabelText(
          "settings:taskNotifications.channels.ntfy.topicUrl",
        ),
      )
      fireEvent.blur(
        within(ntfyChannel).getByLabelText(
          "settings:taskNotifications.channels.ntfy.accessToken",
        ),
      )
      fireEvent.blur(
        within(webhookChannel).getByLabelText(
          "settings:taskNotifications.channels.webhook.url",
        ),
      )
    })

    expect(updateTaskNotificationsMock).not.toHaveBeenCalled()
  })

  it("updates the global switch, announcement switch, and per-task switch through the preferences context", async () => {
    hasPermissionMock.mockResolvedValue(true)

    render(<TaskNotificationSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const globalTaskNotifications = (
      await screen.findByText("settings:taskNotifications.enable")
    ).closest(`[id="${SETTINGS_ANCHORS.TASK_NOTIFICATIONS_ENABLED}"]`)
    const globalSwitch = globalTaskNotifications?.querySelector(
      '[role="switch"]',
    ) as HTMLElement | null
    const autoCheckinTask = screen
      .getByText("settings:taskNotifications.tasks.autoCheckin")
      .closest(`[id="${SETTINGS_ANCHORS.TASK_NOTIFICATIONS_AUTO_CHECKIN}"]`)
    const autoCheckinSwitch = autoCheckinTask?.querySelector(
      '[role="switch"]',
    ) as HTMLElement | null
    const siteAnnouncementNotifications = screen
      .getByText("settings:taskNotifications.siteAnnouncements.enable")
      .closest(
        `[id="${SETTINGS_ANCHORS.TASK_NOTIFICATIONS_SITE_ANNOUNCEMENTS}"]`,
      )
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
