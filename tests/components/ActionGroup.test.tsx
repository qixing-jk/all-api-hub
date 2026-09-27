import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ActionGroup } from "~/components/ui/ActionGroup"

describe("ActionGroup", () => {
  it("keeps actions horizontal and allows whole actions to wrap by default", () => {
    render(
      <ActionGroup role="group" aria-label="Card actions">
        <button type="button">Later</button>
        <button type="button">Continue</button>
      </ActionGroup>,
    )

    expect(screen.getByRole("group", { name: "Card actions" })).toHaveClass(
      "flex-wrap",
      "items-center",
      "justify-end",
    )
  })

  it("stacks dialog actions on narrow screens and restores a row on wider screens", () => {
    render(
      <ActionGroup
        role="group"
        aria-label="Dialog actions"
        layout="stack-on-narrow"
      >
        <button type="button">Cancel</button>
        <button type="button">Confirm</button>
      </ActionGroup>,
    )

    expect(screen.getByRole("group", { name: "Dialog actions" })).toHaveClass(
      "flex-col-reverse",
      "sm:flex-row",
      "sm:justify-end",
    )
  })

  it("lets a context override alignment without rebuilding the responsive policy", () => {
    render(
      <ActionGroup
        role="group"
        aria-label="Banner actions"
        className="gap-y-density-3 justify-start sm:justify-between"
      />,
    )

    expect(screen.getByRole("group", { name: "Banner actions" })).toHaveClass(
      "flex-wrap",
      "gap-y-density-3",
      "justify-start",
      "sm:justify-between",
    )
    expect(
      screen.getByRole("group", { name: "Banner actions" }),
    ).not.toHaveClass("gap-y-density-2", "justify-end")
  })
})
