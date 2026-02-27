import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  detectTurnstileWidget,
  maybeAutoStartTurnstile,
  waitForTurnstileToken,
} from "~/entrypoints/content/messageHandlers/utils/turnstileGuard"

describe("turnstileGuard", () => {
  beforeEach(() => {
    document.title = ""
    document.body.innerHTML = ""
    delete (globalThis as any).__aahTurnstileAutoStartState
    vi.restoreAllMocks()
  })

  describe("detectTurnstileWidget", () => {
    it("returns non-turnstile when no markers exist", () => {
      const detection = detectTurnstileWidget()
      expect(detection.hasTurnstile).toBe(false)
      expect(detection.reasons).toEqual([])
    })

    it("detects cf-turnstile response field", () => {
      document.body.innerHTML =
        '<input name="cf-turnstile-response" value=""></input>'
      const detection = detectTurnstileWidget()
      expect(detection.hasTurnstile).toBe(true)
      expect(detection.reasons).toContain("cf-turnstile-response-field")
    })

    it("detects cf-turnstile container", () => {
      document.body.innerHTML = '<div class="cf-turnstile"></div>'
      const detection = detectTurnstileWidget()
      expect(detection.hasTurnstile).toBe(true)
      expect(detection.reasons).toContain("cf-turnstile-class")
    })

    it("detects turnstile script marker", () => {
      document.body.innerHTML =
        '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>'
      const detection = detectTurnstileWidget()
      expect(detection.hasTurnstile).toBe(true)
      expect(detection.reasons).toContain("turnstile-script")
    })
  })

  describe("maybeAutoStartTurnstile", () => {
    it("skips auto-start when requestId is missing", () => {
      document.body.innerHTML = '<div class="cf-turnstile"></div>'
      const attempt = maybeAutoStartTurnstile({})
      expect(attempt.attempted).toBe(false)
      expect(attempt.reason).toBe("missingRequestId")
    })

    it("skips auto-start when no stable click target is found", () => {
      const attempt = maybeAutoStartTurnstile({ requestId: "req-1" })
      expect(attempt.attempted).toBe(false)
      expect(attempt.reason).toBe("noTarget")
    })

    it("clicks the cf-turnstile container when present", () => {
      const container = document.createElement("div") as any
      container.className = "cf-turnstile"
      container.click = vi.fn()
      document.body.appendChild(container)

      const attempt = maybeAutoStartTurnstile({ requestId: "req-2" })
      expect(attempt.attempted).toBe(true)
      expect(attempt.method).toBe("click")
      expect(container.click).toHaveBeenCalled()
    })

    it("throttles repeated attempts for the same requestId", () => {
      const container = document.createElement("div") as any
      container.className = "cf-turnstile"
      container.click = vi.fn()
      document.body.appendChild(container)

      const first = maybeAutoStartTurnstile({ requestId: "req-3" })
      const second = maybeAutoStartTurnstile({ requestId: "req-3" })

      expect(first.attempted).toBe(true)
      expect(second.attempted).toBe(false)
      expect(second.reason).toBe("throttled")
      expect(container.click).toHaveBeenCalledTimes(1)
    })

    it("stops after reaching max attempts", () => {
      const container = document.createElement("div") as any
      container.className = "cf-turnstile"
      container.click = vi.fn()
      document.body.appendChild(container)

      let now = 10_000
      vi.spyOn(Date, "now").mockImplementation(() => now)

      maybeAutoStartTurnstile({ requestId: "req-4" })
      now += 2000
      maybeAutoStartTurnstile({ requestId: "req-4" })
      now += 2000
      maybeAutoStartTurnstile({ requestId: "req-4" })
      now += 2000
      const fourth = maybeAutoStartTurnstile({ requestId: "req-4" })

      expect(fourth.attempted).toBe(false)
      expect(fourth.reason).toBe("maxAttempts")
      expect(container.click).toHaveBeenCalledTimes(3)
    })
  })

  describe("waitForTurnstileToken", () => {
    it("returns token_obtained when token is already present", async () => {
      document.body.innerHTML =
        '<input name="cf-turnstile-response" value="token-1"></input>'

      const result = await waitForTurnstileToken({
        requestId: "req-token",
        timeoutMs: 500,
      })

      expect(result.status).toBe("token_obtained")
      expect(result.token).toBe("token-1")
    })

    it("returns not_present quickly when no turnstile markers exist", async () => {
      const result = await waitForTurnstileToken({
        requestId: "req-none",
        timeoutMs: 500,
      })

      expect(result.status).toBe("not_present")
      expect(result.token).toBeNull()
      expect(result.detection.hasTurnstile).toBe(false)
    })

    it("uses preTrigger to click a check-in button and obtain a token", async () => {
      const button = document.createElement("button") as any
      button.textContent = "签到"
      button.click = vi.fn(() => {
        const input = document.createElement("input")
        input.setAttribute("name", "cf-turnstile-response")
        ;(input as HTMLInputElement).value = "token-2"
        document.body.appendChild(input)
      })

      document.body.appendChild(button)

      const result = await waitForTurnstileToken({
        requestId: "req-pretrigger",
        timeoutMs: 1500,
        preTrigger: { kind: "checkinButton" },
      })

      expect(result.status).toBe("token_obtained")
      expect(result.token).toBe("token-2")
      expect(button.click).toHaveBeenCalledTimes(1)
    })
  })
})
