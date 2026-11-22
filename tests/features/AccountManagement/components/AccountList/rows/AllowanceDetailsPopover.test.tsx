import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { AllowanceDetailsPopover } from "~/features/AccountManagement/components/AccountList/rows/AllowanceDetailsPopover"
import { render } from "~~/tests/test-utils/render"

describe("AllowanceDetailsPopover", () => {
  it("returns focus to its trigger when Escape closes the panel from inside", async () => {
    const user = userEvent.setup()
    render(
      <AllowanceDetailsPopover label="Allowance details">
        <button>Inside details</button>
      </AllowanceDetailsPopover>,
    )
    const trigger = await screen.findByRole("button", {
      name: "Allowance details",
    })
    await user.click(trigger)
    await user.click(screen.getByRole("button", { name: "Inside details" }))
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
  it("closes a pinned detail panel with its close button and returns focus to the amount details trigger", async () => {
    const user = userEvent.setup()
    render(
      <AllowanceDetailsPopover label="Allowance details">
        <p>Daily plan: $8 remaining</p>
      </AllowanceDetailsPopover>,
    )
    const trigger = await screen.findByRole("button", {
      name: "Allowance details",
    })
    await user.click(trigger)
    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute("aria-expanded", "false")
  })

  it("ignores touch previews and dismisses a pinned panel on outside interaction", async () => {
    const user = userEvent.setup()
    render(
      <>
        <AllowanceDetailsPopover label="Allowance details">
          $2 remaining
        </AllowanceDetailsPopover>
        <button>Next account</button>
      </>,
    )
    const trigger = await screen.findByRole("button", {
      name: "Allowance details",
    })
    fireEvent.pointerEnter(trigger, { pointerType: "touch" })
    fireEvent.pointerLeave(trigger, { pointerType: "touch" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await user.click(trigger)
    const panel = screen.getByRole("dialog")
    fireEvent.pointerEnter(panel, { pointerType: "touch" })
    fireEvent.pointerLeave(panel, { pointerType: "touch" })
    expect(panel).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Next account" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
  it("describes the allowance to keyboard users while retaining focus on the trigger", async () => {
    const user = userEvent.setup()
    render(
      <>
        <AllowanceDetailsPopover label="Allowance details">
          <p>Premium models: $2 remaining</p>
        </AllowanceDetailsPopover>
        <button>Next account</button>
      </>,
    )
    const trigger = await screen.findByRole("button", {
      name: "Allowance details",
    })
    expect(trigger).not.toHaveAccessibleDescription()
    await user.tab()
    expect(trigger).toHaveFocus()
    expect(
      screen.getByRole("dialog", { name: "Allowance details" }),
    ).toBeVisible()
    expect(trigger).toHaveAccessibleDescription("Premium models: $2 remaining")
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(trigger).not.toHaveAccessibleDescription()
    await user.tab()
    await user.tab({ shift: true })
    expect(screen.getByRole("dialog")).toBeVisible()
    await user.tab()
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
  })
})
