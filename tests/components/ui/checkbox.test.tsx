import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

  it("uses defaultChecked and toggles off on click", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Checkbox defaultChecked aria-label="default item" />,
    )

    expect(screen.getByRole("checkbox")).toBeChecked()
    expect(
      container.querySelector('[data-slot="checkbox-checked-icon"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-slot="checkbox-indeterminate-icon"]'),
    ).toBeNull()

    await user.click(screen.getByRole("checkbox"))

    expect(screen.getByRole("checkbox")).not.toBeChecked()
    expect(
      container.querySelector('[data-slot="checkbox-checked-icon"]'),
    ).toBeNull()
    expect(
      container.querySelector('[data-slot="checkbox-indeterminate-icon"]'),
    ).toBeNull()
  })

  it("updates the icon when an uncontrolled indeterminate checkbox is clicked", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Checkbox defaultChecked="indeterminate" aria-label="partial default" />,
    )

    expect(screen.getByRole("checkbox")).toHaveAttribute(
      "aria-checked",
      "mixed",
    )
    expect(
      container.querySelector('[data-slot="checkbox-indeterminate-icon"]'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("checkbox"))

    expect(screen.getByRole("checkbox")).toBeChecked()
    expect(
      container.querySelector('[data-slot="checkbox-checked-icon"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-slot="checkbox-indeterminate-icon"]'),
    ).toBeNull()
  })
})
