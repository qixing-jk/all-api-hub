import { describe, expect, it } from "vitest"

import {
  notificationsSearchControls,
  notificationsSearchSections,
} from "~/features/BasicSettings/components/tabs/Notifications/Notifications.search"

describe("notifications settings search definitions", () => {
  it("registers notification sections on the notifications tab", () => {
    expect(
      notificationsSearchSections.map((section) => [section.id, section.tabId]),
    ).toEqual([
      ["section:task-notifications", "notifications"],
      ["section:task-notification-channels", "notifications"],
      ["section:task-notification-events", "notifications"],
    ])
  })

  it("registers notification controls on the notifications tab", () => {
    expect(
      notificationsSearchControls.every(
        (control) => control.tabId === "notifications",
      ),
    ).toBe(true)
    expect(
      notificationsSearchControls.map((control) => control.targetId),
    ).toEqual([
      "task-notifications-enabled",
      "task-notifications-channel-browser",
      "task-notifications-permission",
      "task-notifications-channel-telegram",
      "task-notifications-channel-webhook",
      "task-notifications-autoCheckin",
      "task-notifications-webdavAutoSync",
      "task-notifications-managedSiteModelSync",
      "task-notifications-usageHistorySync",
      "task-notifications-balanceHistoryCapture",
      "task-notifications-site-announcements",
    ])
  })
})
