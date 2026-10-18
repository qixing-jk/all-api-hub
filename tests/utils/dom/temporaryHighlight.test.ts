// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { temporarilyHighlight } from "~/utils/dom/temporaryHighlight"

describe("temporary navigation target highlight", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("expires without removing the target's original styling", () => {
    const target = document.createElement("div")
    target.className = "rounded-lg ring-2"
    temporarilyHighlight(target)
    expect(target.classList.contains("ring-theme-500")).toBe(true)
    vi.advanceTimersByTime(1800)
    expect(target.className).toBe("rounded-lg ring-2")
  })

  it("restarts the highlight on another request and ignores obsolete cleanup", () => {
    const target = document.createElement("div")
    const firstCleanup = temporarilyHighlight(target)
    vi.advanceTimersByTime(1000)
    temporarilyHighlight(target)
    firstCleanup()
    vi.advanceTimersByTime(800)
    expect(target.classList.contains("ring-theme-500")).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(target.classList.contains("ring-theme-500")).toBe(false)
  })

  it("can clear one target immediately without affecting another", () => {
    const first = document.createElement("div")
    const second = document.createElement("div")
    const clear = temporarilyHighlight(first)
    temporarilyHighlight(second)
    clear()
    expect(first.className).toBe("")
    expect(second.classList.contains("ring-theme-500")).toBe(true)
    vi.runAllTimers()
    expect(second.className).toBe("")
  })
})
