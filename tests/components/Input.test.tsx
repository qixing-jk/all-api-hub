import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  ClearableFieldButton,
  getClearableFieldValue,
} from "~/components/ui/clearableField"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/Textarea"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

describe("clearable field helpers", () => {
  it("normalizes array and missing values for clear-button visibility", () => {
    expect(getClearableFieldValue(["open", "ai"])).toBe("openai")
    expect(getClearableFieldValue(undefined)).toBe("")
  })

  it("keeps button behavior and label attributes from being overridden", async () => {
    render(
      <ClearableFieldButton
        label="Clear field"
        type="submit"
        aria-label="Override"
        title="Override"
      />,
    )

    const button = await screen.findByRole("button", { name: "Clear field" })

    expect(button).toHaveAttribute("type", "button")
    expect(button).toHaveAttribute("title", "Clear field")
  })
})

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

  it("focuses the input immediately after clearing when animation frames are unavailable", async () => {
    const onClear = vi.fn()
    vi.stubGlobal("requestAnimationFrame", undefined)

    try {
      render(
        <Input
          aria-label="search"
          value="saved prompt"
          onChange={vi.fn()}
          onClear={onClear}
          clearButtonLabel="Clear search"
        />,
      )

      const input = await screen.findByLabelText("search")
      fireEvent.click(
        await screen.findByRole("button", { name: "Clear search" }),
      )

      expect(onClear).toHaveBeenCalledTimes(1)
      expect(input).toHaveFocus()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("forwards object refs to the native input element", async () => {
    const inputRef = createRef<HTMLInputElement>()

    render(<Input aria-label="object-ref" ref={inputRef} />)

    const input = await screen.findByLabelText("object-ref")

    expect(inputRef.current).toBe(input)
  })

  it("does not churn forwarded callback refs during value updates", async () => {
    const inputRef = vi.fn()
    const { rerender } = render(
      <Input
        aria-label="callback-ref"
        value="one"
        onChange={vi.fn()}
        ref={inputRef}
      />,
    )

    expect(inputRef).toHaveBeenLastCalledWith(
      await screen.findByLabelText("callback-ref"),
    )
    inputRef.mockClear()

    rerender(
      <Input
        aria-label="callback-ref"
        value="two"
        onChange={vi.fn()}
        ref={inputRef}
      />,
    )

    expect(inputRef).not.toHaveBeenCalled()
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

  it("focuses the textarea immediately after clearing when animation frames are unavailable", async () => {
    const onClear = vi.fn()
    vi.stubGlobal("requestAnimationFrame", undefined)

    try {
      render(
        <Textarea
          aria-label="notes"
          value="saved notes"
          onChange={vi.fn()}
          onClear={onClear}
          clearButtonLabel="Clear notes"
        />,
      )

      const textarea = await screen.findByLabelText("notes")
      fireEvent.click(
        await screen.findByRole("button", { name: "Clear notes" }),
      )

      expect(onClear).toHaveBeenCalledTimes(1)
      expect(textarea).toHaveFocus()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("forwards object refs to the native textarea element", async () => {
    const textareaRef = createRef<HTMLTextAreaElement>()

    render(<Textarea aria-label="object-ref" ref={textareaRef} />)

    const textarea = await screen.findByLabelText("object-ref")

    expect(textareaRef.current).toBe(textarea)
  })

  it("does not churn forwarded callback refs during value updates", async () => {
    const textareaRef = vi.fn()
    const { rerender } = render(
      <Textarea
        aria-label="callback-ref"
        value="one"
        onChange={vi.fn()}
        ref={textareaRef}
      />,
    )

    expect(textareaRef).toHaveBeenLastCalledWith(
      await screen.findByLabelText("callback-ref"),
    )
    textareaRef.mockClear()

    rerender(
      <Textarea
        aria-label="callback-ref"
        value="two"
        onChange={vi.fn()}
        ref={textareaRef}
      />,
    )

    expect(textareaRef).not.toHaveBeenCalled()
  })
})
