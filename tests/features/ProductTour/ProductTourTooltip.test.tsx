import userEvent from "@testing-library/user-event"
import type { TooltipRenderProps } from "react-joyride"
import { describe, expect, it, vi } from "vitest"

import { ProductTourTooltip } from "~/features/ProductTour/ProductTourTooltip"
import { render, screen } from "~~/tests/test-utils/render"

function createTooltipProps(
  overrides: Partial<TooltipRenderProps> = {},
): TooltipRenderProps {
  return {
    backProps: {
      "aria-label": "Back",
      "data-action": "back",
      onClick: vi.fn(),
      role: "button",
      title: "Back",
    },
    closeProps: {
      "aria-label": "Close tour",
      "data-action": "close",
      onClick: vi.fn(),
      role: "button",
      title: "Close tour",
    },
    index: 0,
    isLastStep: false,
    primaryProps: {
      "aria-label": "Next",
      "data-action": "primary",
      onClick: vi.fn(),
      role: "button",
      title: "Next",
    },
    size: 3,
    skipProps: {
      "aria-label": "Skip",
      "data-action": "skip",
      onClick: vi.fn(),
      role: "button",
      title: "Skip",
    },
    step: {
      content: "Understand the main workspace",
      locale: {
        back: "Back",
        close: "Close",
        last: "Finish",
        next: "Next",
        open: "Open",
        skip: "Skip",
      },
      target: "body",
      title: "Workspace",
    },
    tooltipProps: {},
    ...overrides,
  } as TooltipRenderProps
}

describe("ProductTourTooltip", () => {
  it("shows first-step progress and exposes close, skip, and next actions", async () => {
    const user = userEvent.setup()
    const props = createTooltipProps()
    render(<ProductTourTooltip {...props} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      screen.getByRole("heading", { name: "Workspace" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Understand the main workspace")).toBeVisible()
    expect(screen.getByLabelText("1 / 3")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull()

    await user.click(screen.getByRole("button", { name: "Close tour" }))
    await user.click(screen.getByRole("button", { name: "Skip" }))
    await user.click(screen.getByRole("button", { name: "Next" }))

    expect(props.closeProps.onClick).toHaveBeenCalledTimes(1)
    expect(props.skipProps.onClick).toHaveBeenCalledTimes(1)
    expect(props.primaryProps.onClick).toHaveBeenCalledTimes(1)
  })

  it("replaces skip with back and finish actions on the last step", async () => {
    const user = userEvent.setup()
    const props = createTooltipProps({
      index: 2,
      isLastStep: true,
      primaryProps: {
        "aria-label": "Finish",
        "data-action": "primary",
        onClick: vi.fn(),
        role: "button",
        title: "Finish",
      },
    })
    render(<ProductTourTooltip {...props} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Back" }))
    await user.click(screen.getByRole("button", { name: "Finish" }))

    expect(props.backProps.onClick).toHaveBeenCalledTimes(1)
    expect(props.primaryProps.onClick).toHaveBeenCalledTimes(1)
  })
})
