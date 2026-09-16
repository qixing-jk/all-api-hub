import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { InputGroup, InputGroupButton } from "~/components/ui/input-group"

describe("InputGroupButton", () => {
  it("keeps compact text buttons free of vertical padding while allowing content growth", () => {
    render(
      <InputGroup>
        <InputGroupButton size="xs">Extra small</InputGroupButton>
        <InputGroupButton size="sm">Small</InputGroupButton>
        <InputGroupButton size="icon-xs" aria-label="Icon action">
          x
        </InputGroupButton>
      </InputGroup>,
    )

    expect(screen.getByRole("button", { name: "Extra small" })).toHaveClass(
      "min-h-(--density-control-xs)",
      "py-0",
    )
    expect(screen.getByRole("button", { name: "Small" })).toHaveClass(
      "min-h-(--density-control-sm)",
      "py-0",
    )
    expect(screen.getByRole("button", { name: "Icon action" })).toHaveClass(
      "size-(--density-control-xs)",
      "p-0",
    )
  })
})
