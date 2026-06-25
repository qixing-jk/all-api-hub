import { describe, expect, it } from "vitest"

import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  generalSearchControls,
  generalSearchSections,
} from "~/features/BasicSettings/components/tabs/General/General.search"

describe("general settings search definitions", () => {
  it("keeps section search order aligned with the rendered general settings order", () => {
    expect(generalSearchSections.map((section) => section.id)).toEqual([
      "section:display",
      "section:appearance",
      "section:action-click",
      "section:site-announcements",
      "section:changelog",
      "section:logging",
      "section:product-analytics",
      "section:danger",
    ])
  })

  it("keeps diagnostics controls before product analytics and reset actions", () => {
    const orderedControlIds = generalSearchControls.map((control) => control.id)
    expect(orderedControlIds).not.toContain("control:action-click-sidepanel")

    const siteAnnouncementsIndex = orderedControlIds.indexOf(
      "control:site-announcements-polling",
    )
    const changelogIndex = orderedControlIds.indexOf(
      "control:changelog-on-update",
    )
    const productAnalyticsIndex = orderedControlIds.indexOf(
      "control:product-analytics-enabled",
    )
    const loggingIndex = orderedControlIds.indexOf("control:logging-enabled")
    const dangerResetIndex = orderedControlIds.indexOf(
      "control:danger-reset-settings",
    )

    expect(siteAnnouncementsIndex).toBeGreaterThanOrEqual(0)
    expect(changelogIndex).toBeGreaterThanOrEqual(0)
    expect(productAnalyticsIndex).toBeGreaterThanOrEqual(0)
    expect(loggingIndex).toBeGreaterThanOrEqual(0)
    expect(dangerResetIndex).toBeGreaterThanOrEqual(0)

    expect(siteAnnouncementsIndex).toBeLessThan(changelogIndex)
    expect(changelogIndex).toBeLessThan(loggingIndex)
    expect(loggingIndex).toBeLessThan(productAnalyticsIndex)
    expect(productAnalyticsIndex).toBeLessThan(dangerResetIndex)
    expect(loggingIndex).toBeLessThan(dangerResetIndex)
  })

  it("registers all site announcement controls as searchable general settings", () => {
    expect(
      generalSearchControls
        .filter((control) =>
          control.id.startsWith("control:site-announcements"),
        )
        .map((control) => control.targetId),
    ).toEqual([
      SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
      SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_INTERVAL,
      SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_PAGE,
    ])
  })

  it("lets users find the toolbar click behavior by options-page keywords", () => {
    const actionClickControl = generalSearchControls.find(
      (control) => control.id === "control:action-click",
    )

    expect(actionClickControl?.keywords).toEqual(
      expect.arrayContaining(["options", "settings"]),
    )
  })
})
