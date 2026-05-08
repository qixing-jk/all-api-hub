import { beforeEach, describe, expect, it, vi } from "vitest"

import { notifySiteAnnouncements } from "~/services/siteAnnouncements/notificationService"
import type { SiteAnnouncementRecord } from "~/types/siteAnnouncements"
import {
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"

const { getPreferencesMock, notifyTaskResultMock } = vi.hoisted(() => ({
  getPreferencesMock: vi.fn(),
  notifyTaskResultMock: vi.fn(),
}))

const translationCalls: Array<{
  key: string
  options?: Record<string, unknown>
}> = []

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: getPreferencesMock,
  },
}))

vi.mock("~/services/notifications/taskNotificationService", () => ({
  notifyTaskResult: notifyTaskResultMock,
}))

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string, options?: Record<string, unknown>) => {
    translationCalls.push({ key, options })
    if (key.endsWith(".title")) {
      return `${key}:${options?.site}`
    }

    if (key.endsWith(".multipleUnread")) {
      return `${key}:${options?.title}:${options?.count}`
    }

    return key
  }),
}))

const record: SiteAnnouncementRecord = {
  id: "record-1",
  siteKey: "notice:new-api:https://example.com",
  siteName: "Example",
  siteType: "new-api",
  baseUrl: "https://example.com",
  accountId: "account-1",
  providerId: "common",
  title: "Notice",
  content: "Hello",
  fingerprint: "fp",
  firstSeenAt: 1,
  lastSeenAt: 1,
  read: false,
}

describe("siteAnnouncementNotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    translationCalls.length = 0
    getPreferencesMock.mockResolvedValue({
      siteAnnouncementNotifications: {
        enabled: true,
        notificationEnabled: true,
        intervalMinutes: 360,
      },
    })
    notifyTaskResultMock.mockResolvedValue(true)
  })

  it("skips shared task notifications when the announcement notification switch is disabled", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      siteAnnouncementNotifications: {
        enabled: true,
        notificationEnabled: false,
        intervalMinutes: 360,
      },
    })

    await expect(notifySiteAnnouncements([record])).resolves.toEqual({
      success: false,
    })

    expect(notifyTaskResultMock).not.toHaveBeenCalled()
  })

  it("routes a single announcement through notifyTaskResult with localized copy", async () => {
    await expect(notifySiteAnnouncements([record])).resolves.toEqual({
      success: true,
    })

    expect(notifyTaskResultMock).toHaveBeenCalledWith({
      task: TASK_NOTIFICATION_TASKS.SiteAnnouncements,
      status: TASK_NOTIFICATION_STATUSES.Success,
      title: "siteAnnouncements:notification.title:Example",
      message: "Hello",
    })
    expect(translationCalls).toContainEqual({
      key: "siteAnnouncements:notification.title",
      options: { site: "Example" },
    })
  })

  it("routes multiple unread announcements through notifyTaskResult with aggregate copy", async () => {
    const olderRecord: SiteAnnouncementRecord = {
      ...record,
      id: "record-2",
      title: "Second notice",
      content: "Second body",
      fingerprint: "fp-2",
    }

    await expect(
      notifySiteAnnouncements([record, olderRecord]),
    ).resolves.toEqual({
      success: true,
    })

    expect(notifyTaskResultMock).toHaveBeenCalledWith({
      task: TASK_NOTIFICATION_TASKS.SiteAnnouncements,
      status: TASK_NOTIFICATION_STATUSES.Success,
      title: "siteAnnouncements:notification.title:Example",
      message: "siteAnnouncements:notification.multipleUnread:Notice:1",
    })
    expect(translationCalls).toContainEqual({
      key: "siteAnnouncements:notification.multipleUnread",
      options: { title: "Notice", count: 1 },
    })
  })

  it("returns false immediately when there are no records to notify", async () => {
    await expect(notifySiteAnnouncements([])).resolves.toEqual({
      success: false,
    })

    expect(getPreferencesMock).not.toHaveBeenCalled()
    expect(notifyTaskResultMock).not.toHaveBeenCalled()
  })

  it("falls back to the announcement title when preview text is empty", async () => {
    await expect(
      notifySiteAnnouncements([
        {
          ...record,
          title: "Title only",
          content: "",
        },
      ]),
    ).resolves.toEqual({
      success: true,
    })

    expect(notifyTaskResultMock).toHaveBeenCalledWith({
      task: TASK_NOTIFICATION_TASKS.SiteAnnouncements,
      status: TASK_NOTIFICATION_STATUSES.Success,
      title: "siteAnnouncements:notification.title:Example",
      message: "Title only",
    })
  })

  it("surfaces notification delivery errors from the shared task notification service", async () => {
    notifyTaskResultMock.mockRejectedValueOnce(
      new Error("notifications blocked"),
    )

    await expect(notifySiteAnnouncements([record])).resolves.toEqual({
      success: false,
      error: "notifications blocked",
    })
  })
})
