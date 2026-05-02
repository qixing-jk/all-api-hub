import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Checkbox } from "~/components/ui/checkbox"

describe("Checkbox", () => {
  it("uses a check icon for the checked state", () => {
    const { container } = render(<Checkbox checked aria-label="checked item" />)

    expect(screen.getByRole("checkbox")).toBeChecked()
    expect(
      container.querySelector('[data-slot="checkbox-checked-icon"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-slot="checkbox-indeterminate-icon"]'),
    ).toBeNull()
  })

  it("uses a minus icon for the indeterminate state", () => {
    const { container } = render(
      <Checkbox checked="indeterminate" aria-label="partial item" />,
    )

    expect(screen.getByRole("checkbox")).toHaveAttribute(
      "aria-checked",
      "mixed",
    )
    expect(
      container.querySelector('[data-slot="checkbox-indeterminate-icon"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-slot="checkbox-checked-icon"]'),
    ).toBeNull()
  })
})
