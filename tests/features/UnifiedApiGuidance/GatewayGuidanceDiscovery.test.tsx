import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { GatewayGuidanceDiscovery } from "~/features/UnifiedApiGuidance/components/GatewayGuidanceDiscovery"
import { render, screen } from "~~/tests/test-utils/render"

describe("GatewayGuidanceDiscovery", () => {
  it("offers a preview before setup and a resume action after setup starts", async () => {
    const user = userEvent.setup()
    const onExpand = vi.fn()
    const props = { completedSteps: 2, totalSteps: 3, onExpand }
    const { rerender } = render(
      <GatewayGuidanceDiscovery {...props} started={false} />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )
    expect(
      screen.getByText(
        "optionsOverview:unifiedApiGuidance.overview.description",
      ),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:unifiedApiGuidance.overview.start",
      }),
    )
    expect(onExpand).toHaveBeenCalledOnce()
    rerender(<GatewayGuidanceDiscovery {...props} started />)
    expect(
      screen.getByText("optionsOverview:unifiedApiGuidance.overview.progress"),
    ).toBeVisible()
    const resume = screen.getByRole("button", {
      name: "optionsOverview:unifiedApiGuidance.overview.resume",
    })
    expect(resume).toHaveAttribute("aria-expanded", "false")
    await user.click(resume)
    expect(onExpand).toHaveBeenCalledTimes(2)
  })
})
