import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import ManagedSiteSelector from "~/entrypoints/options/pages/BasicSettings/components/tabs/ManagedSite/ManagedSiteSelector"
import { render, screen } from "~/tests/test-utils/render"

describe("ManagedSiteSelector", () => {
  it("includes Done Hub as a selectable managed site type", async () => {
    const user = userEvent.setup()
    render(<ManagedSiteSelector />)

    const trigger = await screen.findByRole("combobox", {
      name: "settings:managedSite.siteTypeLabel",
    })

    await user.click(trigger)

    expect(
      await screen.findByText("settings:managedSite.doneHub"),
    ).toBeInTheDocument()
  })
})
