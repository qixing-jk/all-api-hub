import { describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import InfoPanel from "~/features/AccountManagement/components/AccountDialog/InfoPanel"
import { LDOH_ORIGIN } from "~/services/integrations/ldohSiteLookup/constants"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

describe("AccountDialog InfoPanel", () => {
  it("describes the canonical OpenRouter action as remote Management Key creation", async () => {
    render(
      <InfoPanel
        mode={DIALOG_MODES.ADD}
        phase="site-input"
        formSource="manual"
        autoDetectPresentation={{
          title: "accountDialog:infoPanel.openrouterBootstrap",
          description: "accountDialog:infoPanel.openrouterBootstrapInfo",
        }}
      />,
    )

    expect(
      await screen.findByText("accountDialog:infoPanel.openrouterBootstrap"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:infoPanel.openrouterBootstrapInfo"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("accountDialog:infoPanel.autoDetectInfo"),
    ).not.toBeInTheDocument()
  })

  it("keeps ordinary site auto-detect copy unchanged", async () => {
    render(
      <InfoPanel
        mode={DIALOG_MODES.ADD}
        phase="site-input"
        formSource="manual"
      />,
    )

    expect(
      await screen.findByText("accountDialog:infoPanel.autoDetect"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:infoPanel.autoDetectInfo"),
    ).toBeInTheDocument()
  })

  it("opens LDOH site list in add mode", async () => {
    const createSpy = vi
      .spyOn(browser.tabs, "create")
      .mockResolvedValue({} as browser.tabs.Tab)

    render(
      <InfoPanel
        mode={DIALOG_MODES.ADD}
        phase="site-input"
        formSource="manual"
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

  it("hides onboarding links when detection succeeds", () => {
    render(
      <InfoPanel
        mode={DIALOG_MODES.ADD}
        phase="account-form"
        formSource="detected"
        manualAddGuideAnchor="manual-new-api"
      />,
    )

    expect(
      screen.queryByRole("button", {
        name: "accountDialog:infoPanel.openLdohSiteList",
      }),
    ).not.toBeInTheDocument()
  })

  it("opens the selected site type manual-add guide from the manual form", async () => {
    const createSpy = vi
      .spyOn(browser.tabs, "create")
      .mockResolvedValue({} as browser.tabs.Tab)

    render(
      <InfoPanel
        mode={DIALOG_MODES.ADD}
        phase="account-form"
        formSource="manual"
        manualAddGuideAnchor="manual-new-api"
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "accountDialog:infoPanel.openManualAddGuide",
      }),
    )

    expect(createSpy).toHaveBeenCalledTimes(1)
    const createdUrl = new URL(createSpy.mock.calls[0][0].url!)
    expect(createdUrl.pathname).toContain("/add-account")
    expect(createdUrl.hash).toBe("#manual-new-api")

    createSpy.mockRestore()
  })

  it("hides the manual-add guide entry when the site type has no guide", () => {
    render(
      <InfoPanel
        mode={DIALOG_MODES.ADD}
        phase="account-form"
        formSource="manual"
      />,
    )

    expect(
      screen.queryByRole("button", {
        name: "accountDialog:infoPanel.openManualAddGuide",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:infoPanel.openManualAddGuide",
      }),
    ).not.toBeInTheDocument()
  })
})
