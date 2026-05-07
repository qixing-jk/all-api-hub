import { describe, expect, it } from "vitest"

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
      "section:task-notifications",
      "section:changelog",
      "section:logging",
      "section:danger",
    ])
  })

  it("keeps task notification controls before lower-frequency maintenance controls", () => {
    const orderedControlIds = generalSearchControls.map((control) => control.id)
    const taskNotificationsIndex = orderedControlIds.indexOf(
      "control:task-notifications-enabled",
    )
    const changelogIndex = orderedControlIds.indexOf(
      "control:changelog-on-update",
    )
    const loggingIndex = orderedControlIds.indexOf("control:logging-enabled")
    const dangerResetIndex = orderedControlIds.indexOf(
      "control:danger-reset-settings",
    )

    expect(taskNotificationsIndex).toBeGreaterThanOrEqual(0)
    expect(changelogIndex).toBeGreaterThanOrEqual(0)
    expect(loggingIndex).toBeGreaterThanOrEqual(0)
    expect(dangerResetIndex).toBeGreaterThanOrEqual(0)

    expect(taskNotificationsIndex).toBeLessThan(changelogIndex)
    expect(changelogIndex).toBeLessThan(loggingIndex)
    expect(loggingIndex).toBeLessThan(dangerResetIndex)
  })
})
