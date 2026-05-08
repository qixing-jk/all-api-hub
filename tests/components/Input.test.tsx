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

  it("toggles revealable password inputs between hidden and visible text", async () => {
    render(
      <Input
        aria-label="api-key"
        type="password"
        value="secret"
        onChange={vi.fn()}
        revealable
        revealLabels={{ show: "Show key", hide: "Hide key" }}
      />,
    )

    const input = await screen.findByLabelText("api-key")
    expect(input).toHaveAttribute("type", "password")

    fireEvent.click(await screen.findByRole("button", { name: "Show key" }))
    expect(input).toHaveAttribute("type", "text")

    fireEvent.click(await screen.findByRole("button", { name: "Hide key" }))
    expect(input).toHaveAttribute("type", "password")
  })

  it("supports controlled reveal state and keeps the clear action available", async () => {
    const onClear = vi.fn()
    const onRevealedChange = vi.fn()

    const { rerender } = render(
      <Input
        aria-label="token"
        type="password"
        value="saved token"
        onChange={vi.fn()}
        onClear={onClear}
        clearButtonLabel="Clear token"
        revealable
        revealed={false}
        onRevealedChange={onRevealedChange}
        revealLabels={{ show: "Show token", hide: "Hide token" }}
      />,
    )

    const input = await screen.findByLabelText("token")
    fireEvent.click(await screen.findByRole("button", { name: "Show token" }))

    expect(onRevealedChange).toHaveBeenCalledWith(true)
    expect(input).toHaveAttribute("type", "password")

    rerender(
      <Input
        aria-label="token"
        type="password"
        value="saved token"
        onChange={vi.fn()}
        onClear={onClear}
        clearButtonLabel="Clear token"
        revealable
        revealed={true}
        onRevealedChange={onRevealedChange}
        revealLabels={{ show: "Show token", hide: "Hide token" }}
      />,
    )

    expect(input).toHaveAttribute("type", "text")

    fireEvent.click(await screen.findByRole("button", { name: "Clear token" }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it("reserves enough padding when right icon, reveal, and clear controls are all present", async () => {
    render(
      <Input
        aria-label="compound-token"
        type="password"
        value="saved token"
        onChange={vi.fn()}
        onClear={vi.fn()}
        clearButtonLabel="Clear token"
        rightIcon={<span data-testid="right-icon" />}
        revealable
        revealLabels={{ show: "Show token", hide: "Hide token" }}
      />,
    )

    expect(await screen.findByLabelText("compound-token")).toHaveClass("pr-24")
    expect(screen.getByTestId("right-icon")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Show token" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Clear token" }),
    ).toBeInTheDocument()
  })

  it("renders success feedback with success styling", async () => {
    render(<Input aria-label="api-key" success="Saved" />)

    expect(await screen.findByText("Saved")).toHaveClass(
      "text-green-600",
      "dark:text-green-400",
    )
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

  it("does not show the clear button for empty, disabled, or read-only textareas", () => {
    const { rerender } = render(
      <Textarea
        aria-label="empty"
        value=""
        onChange={vi.fn()}
        onClear={vi.fn()}
        clearButtonLabel="Clear textarea"
      />,
    )

    expect(
      screen.queryByRole("button", { name: "Clear textarea" }),
    ).not.toBeInTheDocument()

    rerender(
      <Textarea
        aria-label="disabled"
        value="disabled"
        onChange={vi.fn()}
        onClear={vi.fn()}
        clearButtonLabel="Clear textarea"
        disabled={true}
      />,
    )

    expect(
      screen.queryByRole("button", { name: "Clear textarea" }),
    ).not.toBeInTheDocument()

    rerender(
      <Textarea
        aria-label="read-only"
        value="read-only"
        onChange={vi.fn()}
        onClear={vi.fn()}
        clearButtonLabel="Clear textarea"
        readOnly={true}
      />,
    )

    expect(
      screen.queryByRole("button", { name: "Clear textarea" }),
    ).not.toBeInTheDocument()
  })
})
