// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  revealNavigationTarget,
  scrollToNavigationTarget,
} from "~/utils/dom/navigationTarget"

describe("navigation target scrolling", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("reveals and focuses a target once, and lets its owner cancel the highlight", () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    )
    const target = document.createElement("button")
    target.scrollIntoView = vi.fn()
    target.focus = vi.fn()

    const cancel = revealNavigationTarget(target, {
      block: "center",
      inline: "nearest",
      focus: true,
      highlight: true,
    })

    expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      behavior: "instant",
      block: "center",
      inline: "nearest",
    })
    expect(target.focus).toHaveBeenCalledExactlyOnceWith({
      preventScroll: true,
    })
    expect(target.classList.contains("ring-theme-500")).toBe(true)
    cancel()
    expect(target.classList.contains("ring-theme-500")).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("preserves a caller's highlight presentation and duration", () => {
    vi.useFakeTimers()
    const target = document.createElement("button")
    target.scrollIntoView = vi.fn()

    revealNavigationTarget(target, {
      highlight: {
        durationMs: 5000,
        onChange: (active) =>
          target.toggleAttribute("data-guidance-highlight", active),
      },
    })

    expect(target.hasAttribute("data-guidance-highlight")).toBe(true)
    expect(target.className).toBe("")
    vi.advanceTimersByTime(4999)
    expect(target.hasAttribute("data-guidance-highlight")).toBe(true)
    vi.advanceTimersByTime(1)
    expect(target.hasAttribute("data-guidance-highlight")).toBe(false)
  })

  it("does not let an older cleanup clear a renewed custom highlight", () => {
    vi.useFakeTimers()
    const target = document.createElement("button")
    target.scrollIntoView = vi.fn()
    const options = {
      highlight: {
        durationMs: 5000,
        onChange: (active: boolean) =>
          target.toggleAttribute("data-guidance-highlight", active),
      },
    }
    const firstCleanup = revealNavigationTarget(target, options)
    vi.advanceTimersByTime(3000)
    const latestCleanup = revealNavigationTarget(target, options)

    firstCleanup()
    vi.advanceTimersByTime(3000)

    expect(target.hasAttribute("data-guidance-highlight")).toBe(true)
    latestCleanup()
    expect(target.hasAttribute("data-guidance-highlight")).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { reducedMotion: false, behavior: "smooth" },
    { reducedMotion: true, behavior: "instant" },
  ])(
    "uses $behavior scrolling with reduced motion $reducedMotion",
    ({ reducedMotion, behavior }) => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: reducedMotion })),
      )
      const target = document.createElement("section")
      target.scrollIntoView = vi.fn()

      scrollToNavigationTarget(target)

      expect(target.scrollIntoView).toHaveBeenCalledWith({
        behavior,
        block: "start",
      })
    },
  )

  it.each(["auto", "instant", "smooth"] as const)(
    "preserves an explicit %s scroll request when motion is allowed",
    (behavior) => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: false })),
      )
      const target = document.createElement("section")
      target.scrollIntoView = vi.fn()

      scrollToNavigationTarget(target, { behavior, block: "center" })

      expect(target.scrollIntoView).toHaveBeenCalledWith({
        behavior,
        block: "center",
      })
    },
  )

  it("uses the requested behavior when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined)
    const target = document.createElement("section")
    target.scrollIntoView = vi.fn()

    scrollToNavigationTarget(target, { behavior: "auto" })

    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    })
  })
})
