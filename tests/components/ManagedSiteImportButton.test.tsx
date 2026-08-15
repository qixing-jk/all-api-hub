import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ManagedSiteImportButton } from "~/components/ManagedSiteImportButton"
import { render, screen } from "~~/tests/test-utils/render"

describe("ManagedSiteImportButton", () => {
  it("exposes the configured managed site as a direct action", async () => {
    const onImport = vi.fn()
    const user = userEvent.setup()

    render(
      <ManagedSiteImportButton
        managedSiteType="new-api"
        managedSiteLabel="Example Gateway"
        onImport={onImport}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToManagedSite",
      }),
    )

    expect(onImport).toHaveBeenCalledOnce()
  })

  it("exposes guided highlighting on the direct action", () => {
    render(
      <ManagedSiteImportButton
        managedSiteType="new-api"
        managedSiteLabel="Example Gateway"
        onImport={vi.fn()}
        highlighted
        testId="managed-site-import"
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(screen.getByTestId("managed-site-import")).toHaveAttribute(
      "data-guidance-highlight",
      "true",
    )
  })
})
