// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getClipboardEventText,
  getSelectedText,
  registerSelectionEndTextDetection,
} from "~/entrypoints/content/shared/contentTextDetection"
import { CONTENT_UI_HOST_TAG } from "~/entrypoints/content/shared/contentUi"

function mockSelectionText(text: string) {
  vi.spyOn(window, "getSelection").mockReturnValue({
    toString: () => text,
  } as any)
}

function makeClipboardEvent(type: "copy" | "cut", clipboardText: string) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as any
  event.clipboardData = {
    getData: (format: string) => (format === "text" ? clipboardText : ""),
  }
  return event as ClipboardEvent
}

describe("contentTextDetection", () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ""
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("extracts trimmed selected text", () => {
    mockSelectionText("  selected text  ")

    expect(getSelectedText()).toBe("selected text")
  })

  it("prefers selected text over clipboard event text", () => {
    mockSelectionText(" selected value ")

    expect(getClipboardEventText(makeClipboardEvent("copy", "clipboard"))).toBe(
      "selected value",
    )
  })

  it("falls back to clipboard event text when selected text is empty", () => {
    mockSelectionText("   ")

    expect(getClipboardEventText(makeClipboardEvent("cut", "clipboard"))).toBe(
      "clipboard",
    )
  })

  it("runs pointerup selection-end detection synchronously for non-empty selected text", () => {
    const onText = vi.fn()
    mockSelectionText(" selected on pointerup ")

    const cleanup = registerSelectionEndTextDetection(onText)

    document.dispatchEvent(new Event("pointerup", { bubbles: true }))

    expect(onText).toHaveBeenCalledWith("selected on pointerup")

    cleanup()
  })

  it("does not require timers for pointerup selection-end detection", () => {
    vi.useFakeTimers()
    const setTimeoutSpy = vi.spyOn(window, "setTimeout")
    const onText = vi.fn()
    mockSelectionText("selected without delay")

    const cleanup = registerSelectionEndTextDetection(onText)

    document.dispatchEvent(new Event("pointerup", { bubbles: true }))

    expect(onText).toHaveBeenCalledWith("selected without delay")
    expect(setTimeoutSpy).not.toHaveBeenCalled()

    cleanup()
  })

  it("does not trigger pointerup selection-end detection for empty selected text", () => {
    const onText = vi.fn()
    mockSelectionText("   ")

    const cleanup = registerSelectionEndTextDetection(onText)

    document.dispatchEvent(new Event("pointerup", { bubbles: true }))

    expect(onText).not.toHaveBeenCalled()

    cleanup()
  })

  it("ignores pointerup events from the extension content UI", () => {
    const onText = vi.fn()
    mockSelectionText("selected from ui")
    const host = document.createElement(CONTENT_UI_HOST_TAG)
    const button = document.createElement("button")
    host.appendChild(button)
    document.body.appendChild(host)

    const cleanup = registerSelectionEndTextDetection(onText)

    button.dispatchEvent(new Event("pointerup", { bubbles: true }))

    expect(onText).not.toHaveBeenCalled()

    cleanup()
  })

  it("removes the pointerup listener on cleanup", () => {
    const onText = vi.fn()
    mockSelectionText("selected before cleanup")

    const cleanup = registerSelectionEndTextDetection(onText)
    cleanup()

    document.dispatchEvent(new Event("pointerup", { bubbles: true }))

    expect(onText).not.toHaveBeenCalled()
  })

  it("does not rely on mouseup for selection-end detection", () => {
    const onText = vi.fn()
    mockSelectionText("selected on mouseup")

    const cleanup = registerSelectionEndTextDetection(onText)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))

    expect(onText).not.toHaveBeenCalled()

    cleanup()
  })
})
