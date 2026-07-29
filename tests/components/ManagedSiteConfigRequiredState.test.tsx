import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ManagedSiteConfigRequiredState from "~/components/ManagedSiteConfigRequiredState"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"

const { openSettingsTab } = vi.hoisted(() => ({
  openSettingsTab: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("~/utils/navigation", () => ({ openSettingsTab }))

describe("ManagedSiteConfigRequiredState", () => {
  beforeEach(() => openSettingsTab.mockClear())

  it("offers a controlled retry and opens the default managed-site settings target", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <ManagedSiteConfigRequiredState
        description="Configure this managed site, then retry."
        onRetry={onRetry}
      />,
    )

    expect(
      screen.getByText("Configure this managed site, then retry."),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )
    expect(onRetry).toHaveBeenCalledTimes(1)

    await user.click(
      screen.getByRole("button", { name: "common:actions.goToSettings" }),
    )
    expect(openSettingsTab).toHaveBeenCalledWith("managedSite", {
      preserveHistory: true,
    })
  })

  it("passes the definition-owned AxonHub anchor to settings navigation", async () => {
    const user = userEvent.setup()
    render(
      <ManagedSiteConfigRequiredState
        description="Configure AxonHub, then retry."
        settingsTarget={{
          tabId: "managedSite",
          anchor: SETTINGS_ANCHORS.AXON_HUB,
        }}
        onRetry={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.goToSettings" }),
    )
    expect(openSettingsTab).toHaveBeenCalledWith("managedSite", {
      anchor: SETTINGS_ANCHORS.AXON_HUB,
      preserveHistory: true,
    })
  })
})
