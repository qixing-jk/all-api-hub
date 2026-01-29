import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  detectCapChallengePage,
  maybeAutoStartCapChallenge,
} from "~/entrypoints/content/messageHandlers/utils/capGuard"

describe("capGuard", () => {
  beforeEach(() => {
    document.title = ""
    document.body.innerHTML = ""
    delete (globalThis as any).__aahCapAutoStartState
    vi.restoreAllMocks()
  })

  describe("detectCapChallengePage", () => {
    it("returns non-challenge when cap-widget is absent", () => {
      const detection = detectCapChallengePage()
      expect(detection.isChallenge).toBe(false)
      expect(detection.reasons).toEqual([])
      expect(detection.apiEndpoint).toBeNull()
    })

    it("detects cap-widget presence", () => {
      document.body.innerHTML = "<cap-widget></cap-widget>"
      const detection = detectCapChallengePage()
      expect(detection.isChallenge).toBe(true)
      expect(detection.reasons).toContain("cap-widget")
    })

    it("captures data-cap-api-endpoint and improves confidence", () => {
      document.body.innerHTML =
        '<cap-widget data-cap-api-endpoint="/__cap_clearance"></cap-widget>'
      const detection = detectCapChallengePage()
      expect(detection.isChallenge).toBe(true)
      expect(detection.apiEndpoint).toBe("/__cap_clearance")
      expect(detection.reasons).toContain("cap-api-endpoint")
      expect(detection.reasons).toContain("cap-clearance-endpoint")
    })
  })

  describe("maybeAutoStartCapChallenge", () => {
    it("skips auto-start when requestId is missing", () => {
      document.body.innerHTML = "<cap-widget></cap-widget>"
      const attempt = maybeAutoStartCapChallenge({})
      expect(attempt.attempted).toBe(false)
      expect(attempt.reason).toBe("missingRequestId")
    })

    it("clicks the widget even when solve() exists", () => {
      const widget = document.createElement("cap-widget") as any
      widget.solve = vi.fn()
      widget.click = vi.fn()
      document.body.appendChild(widget)

      const attempt = maybeAutoStartCapChallenge({ requestId: "req-1" })
      expect(widget.solve).not.toHaveBeenCalled()
      expect(widget.click).toHaveBeenCalled()
      expect(attempt.method).toBe("click")
      expect(attempt.attempted).toBe(true)
    })

    it("clicks the widget when a clickable shadowRoot target is not available", () => {
      const widget = document.createElement("cap-widget") as any
      widget.click = vi.fn()
      document.body.appendChild(widget)

      const attempt = maybeAutoStartCapChallenge({ requestId: "req-2" })
      expect(widget.click).toHaveBeenCalled()
      expect(attempt.method).toBe("click")
      expect(attempt.attempted).toBe(true)
    })

    it("prefers clicking an inner shadowRoot node when available", () => {
      const widget = document.createElement("cap-widget") as any
      widget.id = "my-widget"
      widget.click = vi.fn()

      const root = widget.attachShadow({ mode: "open" })
      const outer = document.createElement("div")
      const inner = document.createElement("div") as any
      inner.click = vi.fn()
      outer.appendChild(inner)
      root.appendChild(outer)

      document.body.appendChild(widget)

      const attempt = maybeAutoStartCapChallenge({ requestId: "req-shadow" })

      expect(inner.click).toHaveBeenCalled()
      expect(widget.click).not.toHaveBeenCalled()
      expect(attempt.method).toBe("click")
      expect(attempt.attempted).toBe(true)
    })

    it("throttles repeated attempts for the same requestId", () => {
      const widget = document.createElement("cap-widget") as any
      widget.click = vi.fn()
      document.body.appendChild(widget)

      const first = maybeAutoStartCapChallenge({ requestId: "req-3" })
      const second = maybeAutoStartCapChallenge({ requestId: "req-3" })

      expect(first.attempted).toBe(true)
      expect(second.attempted).toBe(false)
      expect(second.reason).toBe("throttled")
      expect(widget.click).toHaveBeenCalledTimes(1)
    })

    it("stops after reaching max attempts", () => {
      const widget = document.createElement("cap-widget") as any
      widget.click = vi.fn()
      document.body.appendChild(widget)

      let now = 10_000
      vi.spyOn(Date, "now").mockImplementation(() => now)

      maybeAutoStartCapChallenge({ requestId: "req-4" })
      now += 2000
      maybeAutoStartCapChallenge({ requestId: "req-4" })
      now += 2000
      maybeAutoStartCapChallenge({ requestId: "req-4" })
      now += 2000
      const fourth = maybeAutoStartCapChallenge({ requestId: "req-4" })

      expect(fourth.attempted).toBe(false)
      expect(fourth.reason).toBe("maxAttempts")
      expect(widget.click).toHaveBeenCalledTimes(3)
    })
  })
})
