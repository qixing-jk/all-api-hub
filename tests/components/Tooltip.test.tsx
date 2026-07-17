import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import Tooltip from "~/components/Tooltip"

describe("Tooltip", () => {
  it("uses the actual child as a focusable described anchor when requested", async () => {
    const user = userEvent.setup()

    render(
      <Tooltip content="Group multiplier unavailable" anchorAsChild>
        <button type="button">Switch to VIP</button>
      </Tooltip>,
    )

    const anchor = screen.getByRole("button", { name: "Switch to VIP" })
    expect(anchor.id).toMatch(/^tooltip-/)
    expect(anchor).toHaveAccessibleDescription("Group multiplier unavailable")
    expect(anchor.parentElement).not.toHaveAttribute("id", anchor.id)

    await user.tab()
    expect(anchor).toHaveFocus()
    expect(anchor).toHaveAccessibleDescription("Group multiplier unavailable")
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Group multiplier unavailable",
    )
  })

  it("preserves an existing child id and accessible description", () => {
    render(
      <>
        <span id="existing-description">Existing description</span>
        <Tooltip content="Tooltip description" anchorAsChild>
          <button
            id="existing-anchor"
            type="button"
            aria-describedby="existing-description"
          >
            Switch group
          </button>
        </Tooltip>
      </>,
    )

    const anchor = screen.getByRole("button", { name: "Switch group" })
    expect(anchor).toHaveAttribute("id", "existing-anchor")
    expect(anchor).toHaveAccessibleDescription(
      "Existing description Tooltip description",
    )
  })

  it("retains wrapper anchoring by default without adding a tab stop", () => {
    render(
      <Tooltip content="Legacy tooltip">
        <button type="button">Legacy action</button>
      </Tooltip>,
    )

    const button = screen.getByRole("button", { name: "Legacy action" })
    expect(button).not.toHaveAttribute("id")
    expect(button.parentElement?.id).toMatch(/^tooltip-/)
    expect(button.parentElement).not.toHaveAttribute("tabindex")
  })
})
