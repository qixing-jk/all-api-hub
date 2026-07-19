import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

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

  it("keeps a rich-content child as the focusable anchor and opens its tooltip", async () => {
    const user = userEvent.setup()

    render(
      <Tooltip
        content={
          <div>
            <strong>VIP multiplier details</strong>{" "}
            <a href="https://example.invalid/groups">Learn about groups</a>
          </div>
        }
        anchorAsChild
      >
        <button type="button">Inspect VIP multiplier</button>
      </Tooltip>,
    )

    const anchor = screen.getByRole("button", {
      name: "Inspect VIP multiplier",
    })
    expect(anchor.id).toMatch(/^tooltip-/)
    expect(anchor.parentElement).not.toHaveAttribute("id", anchor.id)

    await user.tab()
    expect(anchor).toHaveFocus()

    const tooltip = await screen.findByRole("tooltip")
    expect(anchor).toHaveAccessibleDescription(
      "VIP multiplier details Learn about groups",
    )
    expect(within(tooltip).getByText("VIP multiplier details")).toBeVisible()
    expect(
      within(tooltip).getByRole("link", { name: "Learn about groups" }),
    ).toBeVisible()
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

  it("opens when keyboard focus enters a focusable descendant without adding a wrapper tab stop", async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Partial coverage">
        <button type="button">Metric value</button>
      </Tooltip>,
    )

    await user.tab()

    expect(screen.getByRole("button", { name: "Metric value" })).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Partial coverage",
    )
  })

  it("closes a focus-opened tooltip on Escape without moving focus", async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Partial coverage">
        <button type="button">Metric value</button>
      </Tooltip>,
    )

    await user.tab()

    const anchor = screen.getByRole("button", { name: "Metric value" })
    expect(anchor).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toBeVisible()

    await user.keyboard("{Escape}")

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    })
    expect(anchor).toHaveFocus()
  })

  it("closes the previous tooltip when focus moves to a sibling anchor", async () => {
    const user = userEvent.setup()
    render(
      <>
        <Tooltip content="First details">
          <button type="button">First metric</button>
        </Tooltip>
        <Tooltip content="Second details" anchorAsChild>
          <button type="button">Second metric</button>
        </Tooltip>
      </>,
    )

    await user.tab()
    expect(screen.getByRole("button", { name: "First metric" })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole("button", { name: "Second metric" })).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Second details",
    )
    expect(screen.getAllByRole("tooltip")).toHaveLength(1)
  })

  it("keeps a rich tooltip open while focus moves from its trigger to an action", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <>
        <Tooltip
          content={
            <button type="button" onClick={onAction}>
              Open settings
            </button>
          }
        >
          <button type="button">Health status</button>
        </Tooltip>
        <button type="button">After tooltip</button>
      </>,
    )

    await user.tab()
    expect(screen.getByRole("button", { name: "Health status" })).toHaveFocus()

    const tooltip = await screen.findByRole("tooltip")
    await user.tab()
    const action = screen.getByRole("button", { name: "Open settings" })
    expect(action).toHaveFocus()
    expect(tooltip).toBeVisible()

    await user.keyboard("{Enter}")
    expect(onAction).toHaveBeenCalledTimes(1)

    await user.tab()
    expect(screen.getByRole("button", { name: "After tooltip" })).toHaveFocus()
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    })
  })
})
