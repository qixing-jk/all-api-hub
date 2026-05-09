import { describe, expect, it } from "vitest"

import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
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
    expect(notificationsSearchSections.map((section) => section.order)).toEqual(
      [303, 304, 305],
    )
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
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_ENABLED,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_BROWSER,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_PERMISSION,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_TELEGRAM,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_FEISHU,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_DINGTALK,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WECOM,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_NTFY,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WEBHOOK,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_AUTO_CHECKIN,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_WEBDAV_AUTO_SYNC,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_MANAGED_SITE_MODEL_SYNC,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_USAGE_HISTORY_SYNC,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_BALANCE_HISTORY_CAPTURE,
      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_SITE_ANNOUNCEMENTS,
    ])
    expect(notificationsSearchControls.map((control) => control.order)).toEqual(
      [
        607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620,
        621,
      ],
    )
  })
})
