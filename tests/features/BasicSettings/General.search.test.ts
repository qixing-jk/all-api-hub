import { describe, expect, it } from "vitest"

import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import {
  generalSearchControls,
  generalSearchSections,
} from "~/features/BasicSettings/components/tabs/General/General.search"
import { LOGGING_SETTINGS_TARGET_IDS } from "~/features/BasicSettings/components/tabs/General/searchTargets"

describe("general settings search definitions", () => {
  it("keeps the log history control and its deep-link target in general settings", () => {
    const control = generalSearchControls.find(
      (item) => item.id === "control:logging-history",
    )
    expect(control?.targetId).toBe(LOGGING_SETTINGS_TARGET_IDS.history)
    expect(control?.keywords).toContain("实时")
    expect(
      BASIC_SETTINGS_ANCHOR_TO_TAB[LOGGING_SETTINGS_TARGET_IDS.history],
    ).toBe("general")
  })
  it("makes local reset discoverable through its existing section deep link", () => {
    for (const id of [
      "section:display",
      "section:action-click",
      "section:changelog",
      "section:logging",
    ]) {
      const section = generalSearchSections.find((section) => section.id === id)
      expect(section?.keywordKeys).toContain("common:actions.reset")
      expect(section?.targetId).toBeTruthy()
    }
  })

  it("keeps section search order aligned with the rendered general settings order", () => {
    expect(generalSearchSections.map((section) => section.id)).toEqual([
      "section:display",
      "section:appearance",
      "section:action-click",
      "section:changelog",
      "section:logging",
      "section:product-analytics",
      "section:danger",
    ])
  })

  it("keeps diagnostics controls before product analytics and reset actions", () => {
    const orderedControlIds = generalSearchControls.map((control) => control.id)
    expect(orderedControlIds).not.toContain("control:action-click-sidepanel")
    expect(orderedControlIds).not.toContain(
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

    expect(changelogIndex).toBeGreaterThanOrEqual(0)
    expect(productAnalyticsIndex).toBeGreaterThanOrEqual(0)
    expect(loggingIndex).toBeGreaterThanOrEqual(0)
    expect(dangerResetIndex).toBeGreaterThanOrEqual(0)

    expect(changelogIndex).toBeLessThan(loggingIndex)
    expect(loggingIndex).toBeLessThan(productAnalyticsIndex)
    expect(productAnalyticsIndex).toBeLessThan(dangerResetIndex)
    expect(loggingIndex).toBeLessThan(dangerResetIndex)
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
