import { describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import InfoPanel from "~/features/AccountManagement/components/AccountDialog/InfoPanel"
import { LDOH_ORIGIN } from "~/services/integrations/ldohSiteLookup/constants"
import { fireEvent, render, screen } from "~/tests/test-utils/render"

describe("AccountDialog InfoPanel", () => {
  it("opens LDOH site list in add mode", async () => {
    const createSpy = vi
      .spyOn(browser.tabs, "create")
      .mockResolvedValue({} as browser.tabs.Tab)

    render(
      <InfoPanel
        mode={DIALOG_MODES.ADD}
        isDetected={false}
        showManualForm={false}
      />,
    )

    const openButton = await screen.findByRole("button", {
      name: "accountDialog:infoPanel.openLdohSiteList",
    })
    fireEvent.click(openButton)

    expect(createSpy).toHaveBeenCalledWith({
      url: LDOH_ORIGIN,
      active: true,
    })

    createSpy.mockRestore()
  })

  it("hides LDOH site list link when detection succeeds", () => {
    render(
      <InfoPanel mode={DIALOG_MODES.ADD} isDetected={true} showManualForm />,
    )

    expect(
      screen.queryByRole("button", {
        name: "accountDialog:infoPanel.openLdohSiteList",
      }),
    ).not.toBeInTheDocument()
  })
})
