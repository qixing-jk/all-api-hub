import { describe, expect, it } from "vitest"

import { Input } from "~/components/ui/input"
import { render, screen } from "~/tests/test-utils/render"

describe("Input", () => {
  it("forwards numeric size to the native input element", async () => {
    render(<Input aria-label="native-size" size={12} />)

    const input = await screen.findByLabelText("native-size")
    expect(input).toHaveAttribute("size", "12")
  })

  it("treats variant size strings as visual variants (no native size attribute)", async () => {
    render(<Input aria-label="variant-size" size="sm" />)

    const input = await screen.findByLabelText("variant-size")
    expect(input).not.toHaveAttribute("size")
    expect(input).toHaveClass("text-xs")
  })
})
