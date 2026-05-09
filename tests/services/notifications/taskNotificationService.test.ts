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

    if (key === "settings:taskNotifications.channels.feishu.title") {
      return "Feishu Bot"
    }

    if (key === "settings:taskNotifications.channels.dingtalk.title") {
      return "DingTalk Bot"
    }

    if (key === "settings:taskNotifications.channels.wecom.title") {
      return "WeCom Bot"
    }

    if (key === "settings:taskNotifications.channels.ntfy.title") {
      return "ntfy"
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
      json: async () => ({
        code: 0,
        data: {},
        msg: "success",
      }),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it("uses the default task switch when stored task preferences omit a task", async () => {
    const {
      [TASK_NOTIFICATION_TASKS.AutoCheckin]: _autoCheckin,
      ...legacyTasks
    } = DEFAULT_TASK_NOTIFICATION_PREFERENCES.tasks
    void _autoCheckin
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        tasks:
          legacyTasks as typeof DEFAULT_TASK_NOTIFICATION_PREFERENCES.tasks,
      },
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
      }),
    ).resolves.toBe(true)

    expect(createNotificationMock).toHaveBeenCalledWith(
      getTaskNotificationId(TASK_NOTIFICATION_TASKS.AutoCheckin),
      expect.objectContaining({
        title:
          "settings:taskNotifications.notification.title.success:settings:taskNotifications.tasks.autoCheckin",
      }),
    )
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

  it("sends Feishu custom bot notifications", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Browser]: {
            enabled: false,
          },
          [TASK_NOTIFICATION_CHANNELS.Feishu]: {
            enabled: true,
            webhookKey: "feishu-webhook-key",
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
      "https://open.feishu.cn/open-apis/bot/v2/hook/feishu-webhook-key",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: expect.stringContaining('"msg_type":"text"'),
      }),
    )
  })

  it("uses the full Feishu webhook URL when one is configured", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Browser]: {
            enabled: false,
          },
          [TASK_NOTIFICATION_CHANNELS.Feishu]: {
            enabled: true,
            webhookKey:
              "https://open.feishu.cn/open-apis/bot/v2/hook/full-feishu-webhook-key",
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

    expect(fetchMock).toHaveBeenCalledWith(
      "https://open.feishu.cn/open-apis/bot/v2/hook/full-feishu-webhook-key",
      expect.objectContaining({
        method: "POST",
      }),
    )
  })

  it("uses configured HTTP Feishu webhook URLs as-is", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Browser]: {
            enabled: false,
          },
          [TASK_NOTIFICATION_CHANNELS.Feishu]: {
            enabled: true,
            webhookKey:
              "http://open.feishu.test/open-apis/bot/v2/hook/local-feishu-webhook-key",
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

    expect(fetchMock).toHaveBeenCalledWith(
      "http://open.feishu.test/open-apis/bot/v2/hook/local-feishu-webhook-key",
      expect.objectContaining({
        method: "POST",
      }),
    )
  })

  it("sends DingTalk custom bot notifications", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Browser]: {
            enabled: false,
          },
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
            enabled: true,
            webhookKey: "dingtalk-access-token",
            secret: "",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        errcode: 0,
        errmsg: "ok",
      }),
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
      }),
    ).resolves.toBe(true)

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oapi.dingtalk.com/robot/send?access_token=dingtalk-access-token",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8",
        },
        body: JSON.stringify({
          msgtype: "text",
          text: {
            content:
              "settings:taskNotifications.notification.title.success:settings:taskNotifications.tasks.autoCheckin\nsettings:taskNotifications.notification.body.success:settings:taskNotifications.tasks.autoCheckin",
          },
          at: {
            isAtAll: false,
          },
        }),
      }),
    )
  })

  it("adds DingTalk signature parameters when a signing secret is configured", async () => {
    const timestamp = "1710000000000"
    const secret = "SECtestsecret"
    vi.spyOn(Date, "now").mockReturnValue(Number(timestamp))
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Browser]: {
            enabled: false,
          },
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
            enabled: true,
            webhookKey:
              "https://oapi.dingtalk.com/robot/send?access_token=full-dingtalk-access-token",
            secret,
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        errcode: 0,
        errmsg: "ok",
      }),
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
      }),
    ).resolves.toBe(true)

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    const parsedUrl = new URL(url)
    expect(parsedUrl.origin + parsedUrl.pathname).toBe(
      "https://oapi.dingtalk.com/robot/send",
    )
    expect(parsedUrl.searchParams.get("access_token")).toBe(
      "full-dingtalk-access-token",
    )
    expect(parsedUrl.searchParams.get("timestamp")).toBe(timestamp)
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}\n${secret}`),
    )
    const expectedSign = btoa(String.fromCharCode(...new Uint8Array(signature)))
    expect(parsedUrl.searchParams.get("sign")).toBe(expectedSign)
  })

  it("sends WeCom group bot notifications", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Browser]: {
            enabled: false,
          },
          [TASK_NOTIFICATION_CHANNELS.Wecom]: {
            enabled: true,
            webhookKey: "wecom-webhook-key",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        errcode: 0,
        errmsg: "ok",
      }),
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
      }),
    ).resolves.toBe(true)

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=wecom-webhook-key",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: expect.stringContaining('"msgtype":"text"'),
      }),
    )
  })

  it("uses the full WeCom webhook URL when one is configured", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Browser]: {
            enabled: false,
          },
          [TASK_NOTIFICATION_CHANNELS.Wecom]: {
            enabled: true,
            webhookKey:
              "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=full-wecom-webhook-key",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        errcode: 0,
        errmsg: "ok",
      }),
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
      }),
    ).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=full-wecom-webhook-key",
      expect.objectContaining({
        method: "POST",
      }),
    )
  })

  it("sends ntfy notifications to a full topic URL", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Browser]: {
            enabled: false,
          },
          [TASK_NOTIFICATION_CHANNELS.Ntfy]: {
            enabled: true,
            topicUrl: "https://ntfy.example.com/all-api-hub",
            accessToken: "ntfy-token",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
      }),
    ).resolves.toBe(true)

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ntfy.example.com/all-api-hub",
      expect.objectContaining({
        method: "POST",
        headers: {
          Title:
            "settings:taskNotifications.notification.title.success:settings:taskNotifications.tasks.autoCheckin",
          Priority: "default",
          Tags: "bell",
          Authorization: "Bearer ntfy-token",
        },
        body: expect.stringContaining(
          "settings:taskNotifications.notification.body.success",
        ),
      }),
    )
  })

  it("sends ntfy notifications to an ntfy.sh topic name", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Browser]: {
            enabled: false,
          },
          [TASK_NOTIFICATION_CHANNELS.Ntfy]: {
            enabled: true,
            topicUrl: "all-api-hub-topic",
            accessToken: "",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
      }),
    ).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ntfy.sh/all-api-hub-topic",
      expect.objectContaining({
        headers: {
          Title:
            "settings:taskNotifications.notification.title.success:settings:taskNotifications.tasks.autoCheckin",
          Priority: "default",
          Tags: "bell",
        },
      }),
    )
  })

  it("RFC 2047 encodes non-ASCII ntfy title headers for browser fetch", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Browser]: {
            enabled: false,
          },
          [TASK_NOTIFICATION_CHANNELS.Ntfy]: {
            enabled: true,
            topicUrl: "https://ntfy.sh/all-api-hub-topic",
            accessToken: "",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
    })

    await expect(
      notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
        title: "自动签到完成",
        message: "测试内容",
      }),
    ).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ntfy.sh/all-api-hub-topic",
      expect.objectContaining({
        headers: expect.objectContaining({
          Title: "=?UTF-8?B?6Ieq5Yqo562+5Yiw5a6M5oiQ?=",
        }),
        body: "测试内容",
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

  it("handles Feishu channel-specific test notification runtime messages", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Feishu]: {
            enabled: true,
            webhookKey: "feishu-webhook-key",
          },
        },
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Feishu,
      },
      sendResponse,
    )

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://open.feishu.cn/open-apis/bot/v2/hook/feishu-webhook-key",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("settings:taskNotifications.test.title"),
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      error: undefined,
    })
  })

  it("handles DingTalk channel-specific test notification runtime messages", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
            enabled: true,
            webhookKey: "dingtalk-access-token",
            secret: "",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        errcode: 0,
        errmsg: "ok",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Dingtalk,
      },
      sendResponse,
    )

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oapi.dingtalk.com/robot/send?access_token=dingtalk-access-token",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("settings:taskNotifications.test.title"),
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      error: undefined,
    })
  })

  it("handles WeCom channel-specific test notification runtime messages", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Wecom]: {
            enabled: true,
            webhookKey: "wecom-webhook-key",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        errcode: 0,
        errmsg: "ok",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Wecom,
      },
      sendResponse,
    )

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=wecom-webhook-key",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("settings:taskNotifications.test.title"),
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

  it("returns Feishu response details for channel-specific tests", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Feishu]: {
            enabled: true,
            webhookKey: "feishu-webhook-key",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        code: 9499,
        msg: "Bad Request",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Feishu,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Feishu Bot returned HTTP 400: Bad Request",
    })
  })

  it("treats Feishu business error responses as channel-specific test failures", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Feishu]: {
            enabled: true,
            webhookKey: "invalid-feishu-webhook-key",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        code: 19001,
        data: {},
        msg: "param invalid: incoming webhook access token invalid",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Feishu,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error:
        "Feishu Bot returned HTTP 200: param invalid: incoming webhook access token invalid",
    })
  })

  it("treats WeCom business error responses as channel-specific test failures", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Wecom]: {
            enabled: true,
            webhookKey: "invalid-wecom-webhook-key",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        errcode: 93000,
        errmsg: "invalid webhook url",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Wecom,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "WeCom Bot returned HTTP 200: invalid webhook url",
    })
  })

  it("falls back to an HTTP status when WeCom error response JSON cannot be read", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Wecom]: {
            enabled: true,
            webhookKey: "wecom-webhook-key",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
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
        channel: TASK_NOTIFICATION_CHANNELS.Wecom,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "WeCom Bot returned HTTP 500",
    })
  })

  it("treats DingTalk business error responses as channel-specific test failures", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
            enabled: true,
            webhookKey: "invalid-dingtalk-access-token",
            secret: "",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        errcode: 310000,
        errmsg: "keywords not in content",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Dingtalk,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "DingTalk Bot returned HTTP 200: keywords not in content",
    })
  })

  it("surfaces DingTalk msgtype validation failures from channel-specific tests", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
            enabled: true,
            webhookKey: "dingtalk-access-token",
            secret: "",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        errcode: 300001,
        errmsg: "msgtype  is null",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Dingtalk,
      },
      sendResponse,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "https://oapi.dingtalk.com/robot/send?access_token=dingtalk-access-token",
      expect.objectContaining({
        body: expect.stringContaining('"msgtype":"text"'),
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "DingTalk Bot returned HTTP 200: msgtype  is null",
    })
  })

  it("accepts DingTalk success responses with errcode returned as a string", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
            enabled: true,
            webhookKey: "dingtalk-access-token",
            secret: "",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        errcode: "0",
        errmsg: "ok",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Dingtalk,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      error: undefined,
    })
  })

  it("treats unparseable DingTalk errcode values as channel-specific failures", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
            enabled: true,
            webhookKey: "dingtalk-access-token",
            secret: "",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        errcode: "not-a-number",
        errmsg: "",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Dingtalk,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "DingTalk Bot returned HTTP 200",
    })
  })

  it("treats DingTalk responses without errcode as channel-specific failures", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
            enabled: true,
            webhookKey: "dingtalk-access-token",
            secret: "",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        errmsg: "missing errcode",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Dingtalk,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "DingTalk Bot returned HTTP 200: missing errcode",
    })
  })

  it("falls back to an HTTP status when DingTalk error response JSON cannot be read", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
            enabled: true,
            webhookKey: "dingtalk-access-token",
            secret: "",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
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
        channel: TASK_NOTIFICATION_CHANNELS.Dingtalk,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "DingTalk Bot returned HTTP 400",
    })
  })

  it("accepts Feishu success responses with StatusCode and code set to zero", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Feishu]: {
            enabled: true,
            webhookKey: "feishu-webhook-key",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        StatusCode: 0,
        StatusMessage: "success",
        code: 0,
        data: {},
        msg: "success",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Feishu,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      error: undefined,
    })
  })

  it("uses legacy Feishu StatusMessage details when msg is unavailable", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Feishu]: {
            enabled: true,
            webhookKey: "feishu-webhook-key",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        StatusCode: 9499,
        StatusMessage: "legacy bad request",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Feishu,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Feishu Bot returned HTTP 400: legacy bad request",
    })
  })

  it("falls back to an HTTP status when Feishu response JSON cannot be read", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Feishu]: {
            enabled: true,
            webhookKey: "feishu-webhook-key",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
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
        channel: TASK_NOTIFICATION_CHANNELS.Feishu,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Feishu Bot returned HTTP 200",
    })
  })

  it("prioritizes Feishu code over legacy StatusCode when judging business success", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Feishu]: {
            enabled: true,
            webhookKey: "invalid-feishu-webhook-key",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        StatusCode: 0,
        StatusMessage: "success",
        code: 19001,
        data: {},
        msg: "param invalid: incoming webhook access token invalid",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Feishu,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error:
        "Feishu Bot returned HTTP 200: param invalid: incoming webhook access token invalid",
    })
  })

  it("falls back to an HTTP status when JSON response details are blank", async () => {
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
      json: async () => ({
        description: "   ",
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
      error: "Telegram Bot returned HTTP 429",
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

  it("returns ntfy response details for channel-specific tests", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Ntfy]: {
            enabled: true,
            topicUrl: "https://ntfy.example.com/private-topic",
            accessToken: "invalid-token",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        error: "unauthorized",
      }),
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Ntfy,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "ntfy returned HTTP 401: unauthorized",
    })
  })

  it("normalizes ntfy host and topic inputs without an explicit scheme", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Ntfy]: {
            enabled: true,
            topicUrl: "ntfy.example.com/all-api-hub-topic",
            accessToken: "",
          },
        },
      },
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Ntfy,
      },
      sendResponse,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ntfy.example.com/all-api-hub-topic",
      expect.objectContaining({
        method: "POST",
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      error: undefined,
    })
  })

  it("rejects ntfy server URLs without a topic path", async () => {
    const sendResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Ntfy]: {
            enabled: true,
            topicUrl: "https://ntfy.example.com/",
            accessToken: "",
          },
        },
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Ntfy,
      },
      sendResponse,
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "settings:taskNotifications.test.ntfyInvalidUrl",
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

    const missingFeishuResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Feishu]: {
            enabled: true,
            webhookKey: "",
          },
        },
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Feishu,
      },
      missingFeishuResponse,
    )

    expect(missingFeishuResponse).toHaveBeenCalledWith({
      success: false,
      error: "settings:taskNotifications.test.feishuMissingConfig",
    })

    const missingDingtalkResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
            enabled: true,
            webhookKey: "",
            secret: "",
          },
        },
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Dingtalk,
      },
      missingDingtalkResponse,
    )

    expect(missingDingtalkResponse).toHaveBeenCalledWith({
      success: false,
      error: "settings:taskNotifications.test.dingtalkMissingConfig",
    })

    const missingWecomResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Wecom]: {
            enabled: true,
            webhookKey: "",
          },
        },
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Wecom,
      },
      missingWecomResponse,
    )

    expect(missingWecomResponse).toHaveBeenCalledWith({
      success: false,
      error: "settings:taskNotifications.test.wecomMissingConfig",
    })

    const missingNtfyResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Ntfy]: {
            enabled: true,
            topicUrl: "",
            accessToken: "",
          },
        },
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Ntfy,
      },
      missingNtfyResponse,
    )

    expect(missingNtfyResponse).toHaveBeenCalledWith({
      success: false,
      error: "settings:taskNotifications.test.ntfyMissingConfig",
    })

    const invalidNtfyResponse = vi.fn()
    getPreferencesMock.mockResolvedValueOnce({
      taskNotifications: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
        channels: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
          [TASK_NOTIFICATION_CHANNELS.Ntfy]: {
            enabled: true,
            topicUrl: "ftp://ntfy.example.com/all-api-hub",
            accessToken: "",
          },
        },
      },
    })

    await handleTaskNotificationMessage(
      {
        action: RuntimeActionIds.TaskNotificationsTest,
        channel: TASK_NOTIFICATION_CHANNELS.Ntfy,
      },
      invalidNtfyResponse,
    )

    expect(invalidNtfyResponse).toHaveBeenCalledWith({
      success: false,
      error: "settings:taskNotifications.test.ntfyInvalidUrl",
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
