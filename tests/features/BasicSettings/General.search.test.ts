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

    expect(
      orderedControlIds.indexOf("control:task-notifications-enabled"),
    ).toBeLessThan(orderedControlIds.indexOf("control:changelog-on-update"))
    expect(
      orderedControlIds.indexOf("control:changelog-on-update"),
    ).toBeLessThan(orderedControlIds.indexOf("control:logging-enabled"))
    expect(orderedControlIds.indexOf("control:logging-enabled")).toBeLessThan(
      orderedControlIds.indexOf("control:danger-reset-settings"),
    )
  })
})
