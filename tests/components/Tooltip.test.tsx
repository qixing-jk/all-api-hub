import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import Tooltip from "~/components/Tooltip"
import { Modal } from "~/components/ui"
import { render as renderWithProviders } from "~~/tests/test-utils/render"

describe("Tooltip", () => {
  it.each(["click", "focus", "hover"])(
    "preserves an immediate %s reopen when an earlier closing transition finishes",
    async (trigger) => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      renderWithProviders(
        <Modal isOpen onClose={onClose} title="Verification">
          <Tooltip content="Saved summary only" anchorAsChild openOnClick>
            <button type="button">Previous result</button>
          </Tooltip>
        </Modal>,
      )
      const anchor = await screen.findByRole("button", {
        name: "Previous result",
      })
      await user.click(anchor)
      const popup = await screen.findByRole("tooltip")
      vi.useFakeTimers()
      try {
        fireEvent.keyDown(anchor, { key: "Escape" })
        await act(() => vi.advanceTimersByTimeAsync(10))
        await act(() => vi.advanceTimersByTimeAsync(10))
        if (trigger === "click") fireEvent.click(anchor)
        else if (trigger === "focus") fireEvent.focus(anchor)
        else fireEvent.mouseOver(anchor)
        await act(() => vi.advanceTimersByTimeAsync(10))
        if (trigger !== "click") expect(popup).toBeInTheDocument()
        fireEvent.transitionEnd(popup, { propertyName: "opacity" })
        for (let step = 0; step < 5; step++)
          await act(() => vi.advanceTimersByTimeAsync(10))
        expect(screen.getByRole("tooltip")).toBeVisible()
        expect(anchor).toHaveAttribute("data-tooltip-open", "true")
        fireEvent.keyDown(anchor, { key: "Escape" })
        await act(() => vi.advanceTimersByTimeAsync(50))
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
        expect(onClose).not.toHaveBeenCalled()
        fireEvent.keyDown(anchor, { key: "Escape" })
        expect(onClose).toHaveBeenCalledOnce()
      } finally {
        vi.useRealTimers()
      }
    },
  )
  it.each([false, true])(
    "keeps a clicked hint open after mouseout until an outside click (anchorAsChild: %s)",
    async (anchorAsChild) => {
      const user = userEvent.setup()
      render(
        <>
          <Tooltip
            content="Saved summary only"
            anchorAsChild={anchorAsChild}
            openOnClick
          >
            <button type="button">Previous result</button>
          </Tooltip>
          <button type="button">Elsewhere</button>
        </>,
      )
      const anchor = screen.getByRole("button", { name: "Previous result" })
      await user.click(anchor)
      expect(await screen.findByRole("tooltip")).toBeVisible()
      await user.unhover(anchor)
      // Touch taps can synthesize mouseout without moving keyboard focus.
      await act(async () => new Promise((resolve) => setTimeout(resolve, 100)))
      expect(screen.getByRole("tooltip")).toBeVisible()
      await user.click(screen.getByRole("button", { name: "Elsewhere" }))
      await waitFor(() =>
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
      )
      await user.hover(anchor)
      await waitFor(() => expect(screen.getByRole("tooltip")).toBeVisible())
      await user.unhover(anchor)
      await waitFor(() =>
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
      )
    },
  )

  it("opens a click-enabled wrapper tooltip when a child receives keyboard focus", async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Saved summary only" openOnClick>
        <button type="button">Previous result</button>
      </Tooltip>,
    )
    await user.tab()
    expect(await screen.findByRole("tooltip")).toBeVisible()
  })
  it("dismisses an interactive tooltip before the containing modal on Escape", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <Modal isOpen onClose={onClose} title="Verification">
        <Tooltip content="Saved summary only" anchorAsChild openOnClick>
          <button type="button">Previous result</button>
        </Tooltip>
      </Modal>,
    )
    await user.click(
      await screen.findByRole("button", { name: "Previous result" }),
    )
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeVisible())
    await user.keyboard("{Escape}")
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    )
    expect(onClose).not.toHaveBeenCalled()
    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledOnce()
  })
  it("reopens a click-enabled hint after Escape without requiring focus to move", async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Saved summary only" anchorAsChild openOnClick>
        <button type="button">Previous result</button>
      </Tooltip>,
    )
    const anchor = screen.getByRole("button", { name: "Previous result" })
    await user.tab()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Saved summary only",
    )
    await user.hover(anchor)
    await user.keyboard("{Escape}")
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    )
    expect(anchor).toHaveFocus()
    await user.click(anchor)
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Saved summary only",
    )
  })
  it("places an opted-in rich tooltip outside its clipped container and keeps the action usable", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderWithProviders(
      <div data-testid="clipped-account-list" className="overflow-hidden">
        <Tooltip
          portalContainer={document.body}
          content={
            <button type="button" onClick={onAction}>
              Configure account login
            </button>
          }
        >
          <button type="button">Account health</button>
        </Tooltip>
      </div>,
    )
    await screen.findByRole("button", { name: "Account health" })
    await user.tab()
    expect(screen.getByRole("button", { name: "Account health" })).toHaveFocus()
    const tooltip = await screen.findByRole("tooltip")
    expect(screen.getByTestId("clipped-account-list")).not.toContainElement(
      tooltip,
    )
    await user.click(
      within(tooltip).getByRole("button", { name: "Configure account login" }),
    )
    expect(onAction).toHaveBeenCalledTimes(1)
    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    })
  })

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

  it("closes after focus leaves without a related target", async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Partial coverage">
        <button type="button">Metric value</button>
      </Tooltip>,
    )

    await user.tab()
    const anchor = screen.getByRole("button", { name: "Metric value" })
    expect(await screen.findByRole("tooltip")).toBeVisible()

    act(() => anchor.blur())

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    })
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
