import { describe, expect, it } from "vitest"

import ManagedSiteSelector from "~/entrypoints/options/pages/BasicSettings/components/ManagedSiteSelector"
import { fireEvent, render, screen } from "~/tests/test-utils/render"

describe("ManagedSiteSelector", () => {
  it("includes Done Hub as a selectable managed site type", async () => {
    render(<ManagedSiteSelector />)

    const trigger = await screen.findByRole("combobox", {
      name: "settings:managedSite.siteTypeLabel",
    })

    fireEvent.click(trigger)

    expect(
      await screen.findByText("settings:managedSite.doneHub"),
    ).toBeInTheDocument()
  })
})
