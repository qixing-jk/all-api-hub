import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  detectTurnstileWidget,
  maybeAutoStartTurnstile,
  waitForTurnstileToken,
} from "~/entrypoints/content/messageHandlers/utils/turnstileGuard"

/**
 * Creates a mock DOM element for tests.
 */
function createMockElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  setup?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName)
  setup?.(element)
  return element
}

describe("turnstileGuard", () => {
  beforeEach(() => {
    document.title = ""
    document.body.innerHTML = ""
    globalThis.__aahTurnstileAutoStartState = undefined
    globalThis.__aahTurnstilePreTriggerState = undefined
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

    it("detects turnstile iframe marker", () => {
      document.body.innerHTML =
        '<iframe src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile"></iframe>'
      const detection = detectTurnstileWidget()
      expect(detection.hasTurnstile).toBe(true)
      expect(detection.reasons).toContain("turnstile-iframe")
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
      const container = createMockElement("div", (el) => {
        el.className = "cf-turnstile"
        el.click = vi.fn()
      })
      document.body.appendChild(container)

      const attempt = maybeAutoStartTurnstile({ requestId: "req-2" })
      expect(attempt.attempted).toBe(true)
      expect(attempt.method).toBe("click")
      expect(container.click).toHaveBeenCalled()
    })

    it("falls back to clicking the turnstile iframe when no container exists", () => {
      const iframe = createMockElement("iframe", (el) => {
        el.setAttribute(
          "src",
          "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile",
        )
        el.click = vi.fn()
      })
      document.body.appendChild(iframe)

      const attempt = maybeAutoStartTurnstile({ requestId: "req-iframe" })

      expect(attempt.attempted).toBe(true)
      expect(attempt.method).toBe("click")
      expect(iframe.click).toHaveBeenCalled()
    })

    it("throttles repeated attempts for the same requestId", () => {
      const container = createMockElement("div", (el) => {
        el.className = "cf-turnstile"
        el.click = vi.fn()
      })
      document.body.appendChild(container)

      const first = maybeAutoStartTurnstile({ requestId: "req-3" })
      const second = maybeAutoStartTurnstile({ requestId: "req-3" })

      expect(first.attempted).toBe(true)
      expect(second.attempted).toBe(false)
      expect(second.reason).toBe("throttled")
      expect(container.click).toHaveBeenCalledTimes(1)
    })

    it("stops after reaching max attempts", () => {
      const container = createMockElement("div", (el) => {
        el.className = "cf-turnstile"
        el.click = vi.fn()
      })
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

    it("returns timeout when Turnstile is present but token never appears", async () => {
      document.body.innerHTML = '<div class="cf-turnstile"></div>'

      const result = await waitForTurnstileToken({
        requestId: "req-timeout",
        timeoutMs: 100,
      })

      expect(result.status).toBe("timeout")
      expect(result.token).toBeNull()
      expect(result.detection.hasTurnstile).toBe(true)
    })

    it("auto-starts an existing turnstile widget and resolves once the token field appears", async () => {
      const container = createMockElement("div", (el) => {
        el.className = "cf-turnstile"
        el.click = vi.fn(() => {
          const input = document.createElement("input")
          input.setAttribute("name", "cf-turnstile-response")
          input.value = "token-from-auto-start"
          document.body.appendChild(input)
        })
      })
      document.body.appendChild(container)

      const result = await waitForTurnstileToken({
        requestId: "req-auto-start-success",
        timeoutMs: 1500,
      })

      expect(result.status).toBe("token_obtained")
      expect(result.token).toBe("token-from-auto-start")
      expect(container.click).toHaveBeenCalledTimes(1)

      const retryAttempt = maybeAutoStartTurnstile({
        requestId: "req-auto-start-success",
      })
      expect(retryAttempt.attempted).toBe(true)
    })

    it("uses preTrigger to click a check-in button and obtain a token", async () => {
      const button = createMockElement("button", (el) => {
        el.textContent = "签到"
        el.click = vi.fn(() => {
          const input = document.createElement("input")
          input.setAttribute("name", "cf-turnstile-response")
          input.value = "token-2"
          document.body.appendChild(input)
        })
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

    it("uses clickSelector preTrigger to render the token field", async () => {
      const trigger = createMockElement("button", (el) => {
        el.className = "turnstile-trigger"
        el.click = vi.fn(() => {
          const input = document.createElement("textarea")
          input.setAttribute("name", "cf-turnstile-response")
          input.value = "token-from-selector"
          document.body.appendChild(input)
        })
      })

      document.body.appendChild(trigger)

      const result = await waitForTurnstileToken({
        requestId: "req-selector",
        timeoutMs: 1500,
        preTrigger: {
          kind: "clickSelector",
          selector: ".turnstile-trigger",
        },
      })

      expect(result.status).toBe("token_obtained")
      expect(result.token).toBe("token-from-selector")
      expect(trigger.click).toHaveBeenCalledTimes(1)
    })

    it("uses clickText preTrigger and ignores already-completed buttons", async () => {
      const completed = createMockElement("button", (el) => {
        el.textContent = "已签到"
        el.click = vi.fn()
      })
      const actionable = createMockElement("button", (el) => {
        el.textContent = "Check in now"
        el.click = vi.fn(() => {
          const input = document.createElement("input")
          input.setAttribute("name", "cf-turnstile-response")
          input.value = "token-click-text"
          document.body.appendChild(input)
        })
      })

      document.body.appendChild(completed)
      document.body.appendChild(actionable)

      const result = await waitForTurnstileToken({
        requestId: "req-click-text",
        timeoutMs: 1500,
        preTrigger: {
          kind: "clickText",
          positivePattern: "check\\s*in",
          negativePattern: "already|已签到",
        },
      })

      expect(result.status).toBe("token_obtained")
      expect(result.token).toBe("token-click-text")
      expect(completed.click).not.toHaveBeenCalled()
      expect(actionable.click).toHaveBeenCalledTimes(1)
    })

    it("falls back to the default check-in patterns when custom preTrigger patterns are invalid", async () => {
      const button = createMockElement("button", (el) => {
        el.textContent = "签到"
        el.click = vi.fn(() => {
          const input = document.createElement("input")
          input.setAttribute("name", "cf-turnstile-response")
          input.value = "token-default-pattern-fallback"
          document.body.appendChild(input)
        })
      })
      document.body.appendChild(button)

      const result = await waitForTurnstileToken({
        requestId: "req-invalid-patterns",
        timeoutMs: 1500,
        preTrigger: {
          kind: "checkinButton",
          positivePattern: "(",
          negativePattern: "x".repeat(300),
        },
      })

      expect(result.status).toBe("token_obtained")
      expect(result.token).toBe("token-default-pattern-fallback")
      expect(button.click).toHaveBeenCalledTimes(1)
    })

    it("respects a zero-attempt preTrigger throttle and does not click even when a target exists", async () => {
      const button = createMockElement("button", (el) => {
        el.textContent = "签到"
        el.click = vi.fn()
      })
      document.body.appendChild(button)

      const result = await waitForTurnstileToken({
        requestId: "req-zero-max-attempts",
        timeoutMs: 500,
        preTrigger: {
          kind: "checkinButton",
          throttle: {
            maxAttempts: 0,
            minIntervalMs: 0,
          },
        },
      })

      expect(result.status).toBe("not_present")
      expect(result.token).toBeNull()
      expect(button.click).not.toHaveBeenCalled()
    })

    it("returns not_present after timeout when preTrigger is enabled but no target can be found", async () => {
      const result = await waitForTurnstileToken({
        requestId: "req-missing-pretrigger",
        timeoutMs: 500,
        preTrigger: {
          kind: "clickSelector",
          selector: ".missing-turnstile-trigger",
        },
      })

      expect(result.status).toBe("not_present")
      expect(result.token).toBeNull()
      expect(result.detection.hasTurnstile).toBe(false)
    })

    it("clears auto-start throttling after timeout so the same request can retry", async () => {
      const container = createMockElement("div", (el) => {
        el.className = "cf-turnstile"
        el.click = vi.fn()
      })
      document.body.appendChild(container)

      const firstAttempt = maybeAutoStartTurnstile({ requestId: "req-retry" })
      expect(firstAttempt.attempted).toBe(true)

      const result = await waitForTurnstileToken({
        requestId: "req-retry",
        timeoutMs: 100,
      })

      expect(result.status).toBe("timeout")

      const retryAttempt = maybeAutoStartTurnstile({ requestId: "req-retry" })
      expect(retryAttempt.attempted).toBe(true)
      expect(container.click).toHaveBeenCalledTimes(2)
    })

    it("clears preTrigger throttling after success so the same request can run again immediately", async () => {
      const createTrigger = (token: string) =>
        createMockElement("button", (el) => {
          el.textContent = "签到"
          el.click = vi.fn(() => {
            const input = document.createElement("input")
            input.setAttribute("name", "cf-turnstile-response")
            input.value = token
            document.body.appendChild(input)
          })
        })

      const firstButton = createTrigger("token-first")
      document.body.appendChild(firstButton)

      const firstResult = await waitForTurnstileToken({
        requestId: "req-pretrigger-reset",
        timeoutMs: 1500,
        preTrigger: { kind: "checkinButton" },
      })

      expect(firstResult.status).toBe("token_obtained")
      expect(firstButton.click).toHaveBeenCalledTimes(1)

      document.body.innerHTML = ""

      const secondButton = createTrigger("token-second")
      document.body.appendChild(secondButton)

      const secondResult = await waitForTurnstileToken({
        requestId: "req-pretrigger-reset",
        timeoutMs: 1500,
        preTrigger: { kind: "checkinButton" },
      })

      expect(secondResult.status).toBe("token_obtained")
      expect(secondResult.token).toBe("token-second")
      expect(secondButton.click).toHaveBeenCalledTimes(1)
    })
  })
})
