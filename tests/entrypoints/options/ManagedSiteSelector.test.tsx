import { beforeAll, describe, expect, it } from "vitest"

import ManagedSiteSelector from "~/entrypoints/options/pages/BasicSettings/components/ManagedSiteSelector"
import settingsEn from "~/locales/en/settings.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { fireEvent, render, screen } from "~/tests/test-utils/render"

describe("ManagedSiteSelector", () => {
  beforeAll(() => {
    testI18n.addResourceBundle("en", "settings", settingsEn, true, true)
  })

  it("includes Done Hub as a selectable managed site type", async () => {
    render(<ManagedSiteSelector />)

    const trigger = await screen.findByRole("combobox", {
      name: settingsEn.managedSite.siteTypeLabel,
    })

    fireEvent.click(trigger)

    expect(
      await screen.findByText(settingsEn.managedSite.doneHub),
    ).toBeInTheDocument()
  })
})
