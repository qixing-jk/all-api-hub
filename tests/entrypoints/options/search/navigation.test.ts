// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearHighlightSearchParam,
  highlightSearchTarget,
  OPTIONS_SEARCH_HIGHLIGHT_PARAM,
} from "~/entrypoints/options/search/navigation"

describe("options search navigation helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ""
    window.history.replaceState(
      null,
      "",
      `/options.html?${OPTIONS_SEARCH_HIGHLIGHT_PARAM}=target#basic`,
    )
  })

  it("returns early when there is no highlight param to clear", () => {
    window.history.replaceState(null, "", "/options.html#basic")

    clearHighlightSearchParam()

    expect(window.location.search).toBe("")
  })

  it("removes the highlight search param when it is present", () => {
    clearHighlightSearchParam()

    expect(window.location.search).not.toContain(OPTIONS_SEARCH_HIGHLIGHT_PARAM)
  })

  it("returns false when the highlight target does not exist", () => {
    expect(highlightSearchTarget("missing-target")).toBe(false)
  })

  it("removes the temporary highlight classes after the timeout elapses", () => {
    const target = document.createElement("div")
    target.id = "target"
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)

    expect(highlightSearchTarget("target")).toBe(true)
    expect(target.className).toContain("ring-2")

    vi.runAllTimers()

    expect(target.className).toBe("")
  })

  afterEach(() => {
    vi.useRealTimers()
  })
})
