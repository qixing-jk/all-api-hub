import { beforeEach, describe, expect, it, vi } from "vitest"

import { useSearchHotkeys } from "~/entrypoints/options/search/useSearchHotkeys"
import { renderHook } from "~~/tests/test-utils/render"

describe("useSearchHotkeys", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("opens the dialog for Ctrl+K and prevents the default browser action", () => {
    const onOpen = vi.fn()

    renderHook(() => useSearchHotkeys({ onOpen }), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.body.dispatchEvent(event)

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it("opens the dialog for Meta+K when the event target is not an element", () => {
    const onOpen = vi.fn()

    renderHook(() => useSearchHotkeys({ onOpen }), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(event)

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it("ignores the shortcut inside editable elements", () => {
    const onOpen = vi.fn()
    const input = document.createElement("input")
    document.body.appendChild(input)

    renderHook(() => useSearchHotkeys({ onOpen }), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )

    expect(onOpen).not.toHaveBeenCalled()
  })

  it("ignores unrelated keys and missing modifiers", () => {
    const onOpen = vi.fn()

    renderHook(() => useSearchHotkeys({ onOpen }), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "p",
        ctrlKey: true,
        bubbles: true,
      }),
    )
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        bubbles: true,
      }),
    )

    expect(onOpen).not.toHaveBeenCalled()
  })

  it("removes the event listener on unmount", () => {
    const onOpen = vi.fn()

    const { unmount } = renderHook(() => useSearchHotkeys({ onOpen }), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })
    unmount()

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        bubbles: true,
      }),
    )

    expect(onOpen).not.toHaveBeenCalled()
  })
})
