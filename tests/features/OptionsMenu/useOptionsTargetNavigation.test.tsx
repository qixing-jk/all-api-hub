import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useOptionsTargetNavigation } from "~/features/OptionsMenu/useOptionsTargetNavigation"
import {
  OPTIONS_SEARCH_ANCHOR_PARAM,
  OPTIONS_SEARCH_HIGHLIGHT_PARAM,
} from "~/features/OptionsSearch/navigation"

describe("options target navigation lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const url = new URL("/options.html", window.location.origin)
    url.hash = MENU_ITEM_IDS.IMPORT_EXPORT
    url.searchParams.set(OPTIONS_SEARCH_ANCHOR_PARAM, "destination")
    url.searchParams.set(OPTIONS_SEARCH_HIGHLIGHT_PARAM, "destination")
    window.history.replaceState(null, "", url)
  })

  afterEach(() => {
    document.getElementById("destination")?.parentElement?.remove()
    vi.useRealTimers()
  })

  function mountTarget() {
    const target = document.createElement("section")
    target.id = "destination"
    target.scrollIntoView = vi.fn()
    const tab = document.createElement("div")
    tab.appendChild(target)
    document.body.appendChild(tab)
    return target
  }

  it.each(["hidden", "inactive"] as const)(
    "waits for a target inside a %s tab to become active",
    async (state) => {
      const target = mountTarget()
      const tab = target.parentElement!
      if (state === "hidden") tab.hidden = true
      else tab.dataset.state = "inactive"
      renderHook(() =>
        useOptionsTargetNavigation({ pageId: MENU_ITEM_IDS.IMPORT_EXPORT }),
      )

      await act(() => vi.advanceTimersByTimeAsync(200))
      expect(target.scrollIntoView).not.toHaveBeenCalled()
      expect(
        new URL(window.location.href).searchParams.has(
          OPTIONS_SEARCH_HIGHLIGHT_PARAM,
        ),
      ).toBe(true)

      tab.hidden = false
      delete tab.dataset.state
      await act(() => vi.advanceTimersByTimeAsync(100))

      expect(target.scrollIntoView).toHaveBeenCalledTimes(1)
      expect(target).toHaveClass("ring-theme-500")
      expect(
        new URL(window.location.href).searchParams.has(
          OPTIONS_SEARCH_HIGHLIGHT_PARAM,
        ),
      ).toBe(false)
    },
  )

  it("stops retrying a missing target after the bounded wait", async () => {
    renderHook(() =>
      useOptionsTargetNavigation({ pageId: MENU_ITEM_IDS.IMPORT_EXPORT }),
    )

    await act(() => vi.advanceTimersByTimeAsync(1900))
    expect(
      new URL(window.location.href).searchParams.has(
        OPTIONS_SEARCH_HIGHLIGHT_PARAM,
      ),
    ).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(
      new URL(window.location.href).searchParams.has(
        OPTIONS_SEARCH_HIGHLIGHT_PARAM,
      ),
    ).toBe(false)
    const target = mountTarget()
    await act(() => vi.advanceTimersByTimeAsync(500))

    expect(target.scrollIntoView).not.toHaveBeenCalled()
    expect(target).not.toHaveClass("ring-theme-500")
  })

  it("lets a manual tab choice cancel retries without consuming the URL marker", async () => {
    const { result } = renderHook(() =>
      useOptionsTargetNavigation({ pageId: MENU_ITEM_IDS.IMPORT_EXPORT }),
    )
    await act(() => vi.advanceTimersByTimeAsync(100))

    act(() => result.current())
    const target = mountTarget()
    await act(() => vi.advanceTimersByTimeAsync(2500))

    expect(target.scrollIntoView).not.toHaveBeenCalled()
    expect(
      new URL(window.location.href).searchParams.has(
        OPTIONS_SEARCH_HIGHLIGHT_PARAM,
      ),
    ).toBe(true)
  })

  it("abandons a request if the URL changes without a navigation event", async () => {
    renderHook(() =>
      useOptionsTargetNavigation({ pageId: MENU_ITEM_IDS.IMPORT_EXPORT }),
    )
    await act(() => vi.advanceTimersByTimeAsync(100))
    window.history.replaceState(
      null,
      "",
      `/options.html#${MENU_ITEM_IDS.BASIC}`,
    )
    const target = mountTarget()

    await act(() => vi.advanceTimersByTimeAsync(2500))

    expect(target.scrollIntoView).not.toHaveBeenCalled()
    expect(target).not.toHaveClass("ring-theme-500")
  })
})
