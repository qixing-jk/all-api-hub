import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Switch } from "~/components/ui/Switch"

describe("Switch", () => {
  it("renders a Radix switch while preserving the controlled onChange API", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <Switch checked={false} onChange={onChange} aria-label="sync enabled" />,
    )

    const switchControl = screen.getByRole("switch", {
      name: "sync enabled",
    })
    expect(switchControl).toHaveAttribute("data-slot", "switch")
    expect(switchControl).toHaveAttribute("aria-checked", "false")

    await user.click(switchControl)

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it("does not call onChange when disabled", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <Switch
        checked={false}
        disabled
        onChange={onChange}
        aria-label="sync enabled"
      />,
    )

    await user.click(screen.getByRole("switch", { name: "sync enabled" }))

    expect(onChange).not.toHaveBeenCalled()
  })
})
