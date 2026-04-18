import { describe, expect, it, vi } from "vitest"

import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/Textarea"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

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

  it("shows a clear button for controlled values and calls the clear handler", async () => {
    const onClear = vi.fn()

    render(
      <Input
        aria-label="search"
        value="saved prompt"
        onChange={vi.fn()}
        onClear={onClear}
        clearButtonLabel="Clear search"
      />,
    )

    fireEvent.click(await screen.findByRole("button", { name: "Clear search" }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it("does not show the clear button for empty, disabled, or read-only inputs", () => {
    const { rerender } = render(
      <Input
        aria-label="empty"
        value=""
        onChange={vi.fn()}
        onClear={vi.fn()}
        clearButtonLabel="Clear input"
      />,
    )

    expect(
      screen.queryByRole("button", { name: "Clear input" }),
    ).not.toBeInTheDocument()

    rerender(
      <Input
        aria-label="disabled"
        value="disabled"
        onChange={vi.fn()}
        onClear={vi.fn()}
        clearButtonLabel="Clear input"
        disabled={true}
      />,
    )

    expect(
      screen.queryByRole("button", { name: "Clear input" }),
    ).not.toBeInTheDocument()

    rerender(
      <Input
        aria-label="read-only"
        value="read-only"
        onChange={vi.fn()}
        onClear={vi.fn()}
        clearButtonLabel="Clear input"
        readOnly={true}
      />,
    )

    expect(
      screen.queryByRole("button", { name: "Clear input" }),
    ).not.toBeInTheDocument()
  })
})

describe("Textarea", () => {
  it("shows a clear button for controlled values and calls the clear handler", async () => {
    const onClear = vi.fn()

    render(
      <Textarea
        aria-label="notes"
        value="saved notes"
        onChange={vi.fn()}
        onClear={onClear}
        clearButtonLabel="Clear notes"
      />,
    )

    fireEvent.click(await screen.findByRole("button", { name: "Clear notes" }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
