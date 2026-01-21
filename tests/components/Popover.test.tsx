import { describe, expect, it } from "vitest"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { fireEvent, render, screen } from "~/tests/test-utils/render"

describe("Popover", () => {
  it("renders PopoverContent with trigger-matching width by default", async () => {
    render(
      <Popover>
        <PopoverTrigger asChild>
          <button type="button">Open</button>
        </PopoverTrigger>
        <PopoverContent>Popover body</PopoverContent>
      </Popover>,
    )

    const button = await screen.findByRole("button", { name: "Open" })
    fireEvent.click(button)
    await screen.findByText("Popover body")

    const content = document.querySelector('[data-slot="popover-content"]')
    expect(content).toBeInTheDocument()
    expect(content).toHaveClass("w-(--radix-popper-anchor-width)")
  })
})
