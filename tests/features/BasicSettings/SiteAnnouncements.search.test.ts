import { describe, expect, it } from "vitest"

import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  siteAnnouncementsSearchControls,
  siteAnnouncementsSearchSections,
} from "~/features/BasicSettings/components/tabs/SiteAnnouncements/SiteAnnouncements.search"

describe("site announcements settings search definitions", () => {
  it("makes the section reset discoverable through its deep link", () => {
    const section = siteAnnouncementsSearchSections.find(
      (section) => section.id === "section:site-announcements",
    )
    expect(section?.keywordKeys).toContain("common:actions.reset")
    expect(section?.targetId).toBeTruthy()
  })

  it("keeps section search order aligned with the rendered tab order", () => {
    expect(
      siteAnnouncementsSearchSections.map((section) => section.id),
    ).toEqual(["section:site-announcements"])
  })

  it("registers all site announcement controls as searchable settings", () => {
    expect(
      siteAnnouncementsSearchControls.map((control) => control.targetId),
    ).toEqual([
      SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
      SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_INTERVAL,
      SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_MAX_AGE,
      SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_UPSTREAM_READ,
      SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_PAGE,
    ])
  })
})
