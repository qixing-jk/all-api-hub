import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  TURNSTILE_MESSAGE_EVENTS,
  TURNSTILE_MESSAGE_ORIGIN,
  TURNSTILE_MESSAGE_SOURCE,
} from "~/constants/turnstile"
import { waitForTurnstileToken } from "~/entrypoints/content/messageHandlers/utils/turnstileGuard"
import { emitTurnstileEvent } from "~~/tests/test-utils/turnstile"

describe("waitForTurnstileToken user assist", () => {
  it("keeps an unopened reminder available for two minutes", async () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div class="cf-turnstile"></div>'
    const requestAssist = vi.fn(() => true)
    const finished = vi.fn()
    const pending = waitForTurnstileToken({ userAssist: { requestAssist } })
    void pending.then(finished)
    await vi.advanceTimersByTimeAsync(131_000)
    const endedEarly = finished.mock.calls.length
    await vi.advanceTimersByTimeAsync(1_250)
    await expect(pending).resolves.toMatchObject({ status: "timeout" })
    expect(endedEarly).toBe(0)
    expect(requestAssist).toHaveBeenCalledOnce()
  })

  it.each([0, 110_000])(
    "allows exactly one minute after the user opens %s ms later",
    async (delay) => {
      vi.useFakeTimers()
      document.body.innerHTML = '<div class="cf-turnstile"></div>'
      const register = vi.spyOn(browser.runtime.onMessage, "addListener")
      const unregister = vi.spyOn(browser.runtime.onMessage, "removeListener")
      const finished = vi.fn()
      try {
        const pending = waitForTurnstileToken({
          requestId: "token-user-opened",
          userAssist: { requestAssist: () => true },
        })
        void pending.then(finished)
        await vi.advanceTimersByTimeAsync(14_000 + delay)
        const listener = register.mock.calls.at(-1)![0]
        const opened = {
          action: RuntimeActionIds.ContentVerificationAssistOpened,
          requestId: "token-user-opened",
        }
        listener(opened, {}, vi.fn())
        await vi.advanceTimersByTimeAsync(30_000)
        listener(opened, {}, vi.fn())
        await vi.advanceTimersByTimeAsync(29_000)
        const early = finished.mock.calls.length
        await vi.advanceTimersByTimeAsync(1_250)
        const onTime = finished.mock.calls.length
        await vi.advanceTimersByTimeAsync(150_000)
        await pending
        expect(early).toBe(0)
        expect(onTime).toBe(1)
        expect(unregister).toHaveBeenCalledWith(listener)
      } finally {
        register.mockRestore()
        unregister.mockRestore()
      }
    },
  )

  beforeEach(() => {
    document.title = ""
    document.body.innerHTML = ""
    globalThis.__aahTurnstileAutoStartState = undefined
    globalThis.__aahTurnstilePreTriggerState = undefined
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("requests assistance as soon as Turnstile enters interactive mode", async () => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<iframe id="cf-chl-widget-active" src="https://challenges.cloudflare.com/turnstile/widget"></iframe>'
    const frame = document.querySelector("iframe")!
    const requestAssist = vi.fn(() => false)
    const pending = waitForTurnstileToken({
      requestId: "interactive-state",
      userAssist: { requestAssist },
    })
    await vi.advanceTimersByTimeAsync(0)
    emitTurnstileEvent(frame, TURNSTILE_MESSAGE_EVENTS.InteractiveBegin)
    await vi.advanceTimersByTimeAsync(250)
    const earlyCalls = requestAssist.mock.calls.length
    await vi.advanceTimersByTimeAsync(12_000)
    await pending
    expect(earlyCalls).toBe(1)
  })

  it("stays quiet while Turnstile verifies and later completes automatically", async () => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<iframe id="cf-chl-widget-active" src="https://challenges.cloudflare.com/turnstile/widget"></iframe><input name="cf-turnstile-response">'
    const requestAssist = vi.fn(() => false)
    const pending = waitForTurnstileToken({
      requestId: "automatic-state",
      userAssist: { autoAttemptMs: 4_000, requestAssist },
    })
    await vi.advanceTimersByTimeAsync(0)
    emitTurnstileEvent(
      document.querySelector("iframe")!,
      TURNSTILE_MESSAGE_EVENTS.Init,
    )
    await vi.advanceTimersByTimeAsync(18_000)
    document.querySelector("input")!.value = "automatic-token"
    await vi.advanceTimersByTimeAsync(250)
    await expect(pending).resolves.toMatchObject({ token: "automatic-token" })
    expect(requestAssist).not.toHaveBeenCalled()
  })

  it("gives an unreadable widget the full automatic wait before the fallback reminder", async () => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<div class="cf-turnstile"><input name="cf-turnstile-response"></div>'
    const requestAssist = vi.fn(() => false)
    const pending = waitForTurnstileToken({
      requestId: "unknown-self-solved",
      userAssist: { requestAssist },
    })
    await vi.advanceTimersByTimeAsync(6_000)
    document.querySelector("input")!.value = "late-automatic-token"
    await vi.advanceTimersByTimeAsync(250)
    await expect(pending).resolves.toMatchObject({
      token: "late-automatic-token",
    })
    expect(requestAssist).not.toHaveBeenCalled()
  })

  it("recognizes a widget by its response field when its frame is not queryable by ID", async () => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<div class="cf-turnstile"><iframe src="https://challenges.cloudflare.com/turnstile/widget"></iframe><input type="hidden" id="cf-chl-widget-active_response" name="cf-turnstile-response"></div>'
    const requestAssist = vi.fn(() => false)
    const pending = waitForTurnstileToken({ userAssist: { requestAssist } })
    await vi.advanceTimersByTimeAsync(0)
    emitTurnstileEvent(
      document.querySelector("iframe")!,
      TURNSTILE_MESSAGE_EVENTS.InteractiveBegin,
    )
    await vi.advanceTimersByTimeAsync(250)
    const earlyCalls = requestAssist.mock.calls.length
    await vi.advanceTimersByTimeAsync(12_000)
    await pending
    expect(earlyCalls).toBe(1)
  })

  it("observes verification that starts during the initial page API read", async () => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<iframe id="cf-chl-widget-active" src="https://challenges.cloudflare.com/turnstile/widget"></iframe>'
    const frame = document.querySelector("iframe")!
    const requestAssist = vi.fn(() => false)
    const readPageToken = vi.fn(async () => null)
    readPageToken.mockImplementationOnce(async () => {
      emitTurnstileEvent(frame, TURNSTILE_MESSAGE_EVENTS.Init)
      return null
    })
    const pending = waitForTurnstileToken({
      userAssist: { requestAssist, readPageToken },
    })
    await vi.advanceTimersByTimeAsync(46_000)
    await expect(pending).resolves.toMatchObject({ status: "timeout" })
    expect(requestAssist).not.toHaveBeenCalled()
  })

  it("does not hide an interactive widget behind another widget's automatic progress", async () => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<iframe id="cf-chl-widget-first" src="https://challenges.cloudflare.com/turnstile/first"></iframe><iframe id="cf-chl-widget-active" src="https://challenges.cloudflare.com/turnstile/active"></iframe>'
    const frames = document.querySelectorAll("iframe")
    const requestAssist = vi.fn(() => false)
    const pending = waitForTurnstileToken({ userAssist: { requestAssist } })
    await vi.advanceTimersByTimeAsync(0)
    emitTurnstileEvent(frames[0]!, TURNSTILE_MESSAGE_EVENTS.Init, "first")
    emitTurnstileEvent(frames[1]!, TURNSTILE_MESSAGE_EVENTS.InteractiveBegin)
    await vi.advanceTimersByTimeAsync(250)
    const earlyCalls = requestAssist.mock.calls.length
    await vi.advanceTimersByTimeAsync(12_000)
    await pending
    expect(earlyCalls).toBe(1)
  })

  it("keeps the fallback available for a second widget with unknown state", async () => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<iframe id="cf-chl-widget-active" src="https://challenges.cloudflare.com/turnstile/active"></iframe><div class="cf-turnstile"></div>'
    const requestAssist = vi.fn(() => false)
    const pending = waitForTurnstileToken({ userAssist: { requestAssist } })
    await vi.advanceTimersByTimeAsync(0)
    emitTurnstileEvent(
      document.querySelector("iframe")!,
      TURNSTILE_MESSAGE_EVENTS.Init,
    )
    await vi.advanceTimersByTimeAsync(13_000)
    const calls = requestAssist.mock.calls.length
    await vi.advanceTimersByTimeAsync(45_000)
    await pending
    expect(calls).toBe(1)
  })

  it.each([
    TURNSTILE_MESSAGE_EVENTS.InteractiveEnd,
    TURNSTILE_MESSAGE_EVENTS.Complete,
    TURNSTILE_MESSAGE_EVENTS.Fail,
    TURNSTILE_MESSAGE_EVENTS.TokenExpired,
    TURNSTILE_MESSAGE_EVENTS.InteractiveTimeout,
  ])(
    "rechecks %s before sending a reminder and still requires a token",
    async (event) => {
      vi.useFakeTimers()
      document.body.innerHTML =
        '<iframe id="cf-chl-widget-active" src="https://challenges.cloudflare.com/turnstile/widget"></iframe><input name="cf-turnstile-response">'
      const requestAssist = vi.fn(() => false)
      const finished = vi.fn()
      const pending = waitForTurnstileToken({ userAssist: { requestAssist } })
      void pending.then(finished)
      await vi.advanceTimersByTimeAsync(0)
      const frame = document.querySelector("iframe")!
      emitTurnstileEvent(frame, TURNSTILE_MESSAGE_EVENTS.InteractiveBegin)
      emitTurnstileEvent(frame, event)
      await vi.advanceTimersByTimeAsync(500)
      expect(finished).not.toHaveBeenCalled()
      expect(requestAssist).not.toHaveBeenCalled()
      document.querySelector("input")!.value = "confirmed-token"
      await vi.advanceTimersByTimeAsync(250)
      await expect(pending).resolves.toMatchObject({ token: "confirmed-token" })
    },
  )

  it.each(["wrong-origin", "wrong-source", "missing-source", "wrong-widget"])(
    "ignores %s interaction messages",
    async (invalid) => {
      vi.useFakeTimers()
      document.body.innerHTML =
        '<iframe id="cf-chl-widget-active" src="https://challenges.cloudflare.com/turnstile/widget"></iframe><input name="cf-turnstile-response">'
      const requestAssist = vi.fn(() => false)
      const pending = waitForTurnstileToken({ userAssist: { requestAssist } })
      await vi.advanceTimersByTimeAsync(0)
      window.dispatchEvent(
        new MessageEvent("message", {
          origin:
            invalid === "wrong-origin"
              ? "https://example.com"
              : TURNSTILE_MESSAGE_ORIGIN,
          source:
            invalid === "missing-source"
              ? null
              : invalid === "wrong-source"
                ? window
                : document.querySelector("iframe")!.contentWindow,
          data: {
            source: TURNSTILE_MESSAGE_SOURCE,
            widgetId: invalid === "wrong-widget" ? "other" : "active",
            event: TURNSTILE_MESSAGE_EVENTS.InteractiveBegin,
          },
        }),
      )
      await vi.advanceTimersByTimeAsync(500)
      document.querySelector("input")!.value = "automatic-token"
      await vi.advanceTimersByTimeAsync(250)
      await pending
      expect(requestAssist).not.toHaveBeenCalled()
    },
  )

  it("asks the user to finish a visible widget and keeps waiting for the token", async () => {
    document.body.innerHTML = '<div class="cf-turnstile"></div>'
    let assisted = false
    const requestAssist = vi.fn(() => {
      assisted = true
    })

    const result = await waitForTurnstileToken({
      requestId: "req-assist",
      timeoutMs: 80,
      userAssist: {
        autoAttemptMs: 20,
        reminderTimeoutMs: 400,
        pageTokenIntervalMs: 0,
        requestAssist,
        readPageToken: async () => (assisted ? "token-after-assist" : null),
      },
    })

    expect(result).toMatchObject({
      status: "token_obtained",
      token: "token-after-assist",
    })
    expect(requestAssist).toHaveBeenCalledTimes(1)
  })

  it("does not surface the window when the page never renders Turnstile", async () => {
    const requestAssist = vi.fn()

    const result = await waitForTurnstileToken({
      requestId: "req-no-widget",
      timeoutMs: 80,
      userAssist: {
        autoAttemptMs: 20,
        reminderTimeoutMs: 2_000,
        requestAssist,
        readPageToken: async () => null,
      },
    })

    expect(result.status).toBe("not_present")
    expect(requestAssist).not.toHaveBeenCalled()
  })

  it("uses the official page API token when the response field stays empty", async () => {
    document.body.innerHTML = '<div class="cf-turnstile"></div>'
    const requestAssist = vi.fn()

    const result = await waitForTurnstileToken({
      requestId: "req-page-api",
      timeoutMs: 300,
      userAssist: {
        autoAttemptMs: 1_000,
        reminderTimeoutMs: 1_000,
        pageTokenIntervalMs: 0,
        requestAssist,
        readPageToken: async ({ allowExecute }) =>
          allowExecute ? null : "token-from-page-api",
      },
    })

    expect(result).toMatchObject({
      status: "token_obtained",
      token: "token-from-page-api",
    })
    expect(requestAssist).not.toHaveBeenCalled()
  })

  it("does not keep the window waiting when assistance is declined", async () => {
    document.body.innerHTML = '<div class="cf-turnstile"></div>'
    const requestAssist = vi.fn(async () => false)
    const started = Date.now()

    const result = await waitForTurnstileToken({
      requestId: "req-quiet",
      timeoutMs: 80,
      userAssist: {
        autoAttemptMs: 10,
        reminderTimeoutMs: 5_000,
        pageTokenIntervalMs: 0,
        requestAssist,
        readPageToken: async () => null,
      },
    })

    expect(result.status).toBe("timeout")
    expect(requestAssist).toHaveBeenCalledTimes(1)
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it("keeps the full manual window when the assist waits for its turn", async () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div class="cf-turnstile"></div>'
    const started = Date.now()
    // Stands in for a presentation queued behind another verification window.
    const requestAssist = vi.fn(
      () =>
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 400)),
    )

    const pending = waitForTurnstileToken({
      requestId: "req-queued-assist",
      timeoutMs: 500,
      userAssist: {
        autoAttemptMs: 10,
        reminderTimeoutMs: 900,
        pageTokenIntervalMs: 0,
        requestAssist,
        readPageToken: async () =>
          Date.now() - started >= 1_100 ? "token-after-queue" : null,
      },
    })

    await vi.advanceTimersByTimeAsync(2_000)

    await expect(pending).resolves.toMatchObject({
      status: "token_obtained",
      token: "token-after-queue",
    })
    expect(requestAssist).toHaveBeenCalledTimes(1)
  })

  it("keeps watching for a self-solved token while the assist waits for its turn", async () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div class="cf-turnstile"></div>'
    const started = Date.now()
    let assistSettled = false
    const requestAssist = vi.fn(
      () =>
        new Promise<boolean>((resolve) =>
          setTimeout(() => {
            assistSettled = true
            resolve(true)
          }, 5_000),
        ),
    )
    let resolvedAt: number | null = null

    const pending = waitForTurnstileToken({
      requestId: "req-queued-self-solved",
      timeoutMs: 500,
      userAssist: {
        autoAttemptMs: 10,
        reminderTimeoutMs: 5_000,
        pageTokenIntervalMs: 0,
        requestAssist,
        readPageToken: async () =>
          Date.now() - started >= 600 ? "token-self-solved" : null,
      },
    })
    void pending.then(() => {
      resolvedAt = Date.now()
    })

    await vi.advanceTimersByTimeAsync(2_000)

    expect(assistSettled).toBe(false)
    expect(resolvedAt).not.toBeNull()
    expect((resolvedAt ?? 0) - started).toBeLessThan(2_000)
    await expect(pending).resolves.toMatchObject({
      status: "token_obtained",
      token: "token-self-solved",
    })
    expect(requestAssist).toHaveBeenCalledTimes(1)
  })

  it("starts a deferred Turnstile widget once without asking the user to take over", async () => {
    document.body.innerHTML = '<div class="cf-turnstile"></div>'
    const requestAssist = vi.fn(async () => false)
    const allowExecuteValues: boolean[] = []

    const result = await waitForTurnstileToken({
      requestId: "req-quiet-execute",
      timeoutMs: 400,
      userAssist: {
        autoAttemptMs: 5_000,
        reminderTimeoutMs: 5_000,
        pageTokenIntervalMs: 0,
        requestAssist,
        readPageToken: async ({ allowExecute }) => {
          allowExecuteValues.push(allowExecute)
          return allowExecute ? "token-after-execute" : null
        },
      },
    })

    expect(result).toMatchObject({
      status: "token_obtained",
      token: "token-after-execute",
    })
    expect(allowExecuteValues).toContain(true)
    expect(requestAssist).not.toHaveBeenCalled()
  })

  it("handles readPageToken errors gracefully", async () => {
    document.body.innerHTML = '<div class="cf-turnstile"></div>'
    const result = await waitForTurnstileToken({
      requestId: "req-read-error",
      timeoutMs: 50,
      userAssist: {
        autoAttemptMs: 100,
        reminderTimeoutMs: 100,
        pageTokenIntervalMs: 0,
        requestAssist: vi.fn(),
        readPageToken: async () => {
          throw new Error("API call failed")
        },
      },
    })
    expect(result.status).toBe("timeout")
  })

  it("treats requestAssist rejection as accepted and keeps waiting", async () => {
    document.body.innerHTML = '<div class="cf-turnstile"></div>'
    let assisted = false
    const requestAssist = vi.fn(async () => {
      assisted = true
      throw new Error("network issue")
    })

    const result = await waitForTurnstileToken({
      requestId: "req-assist-reject",
      timeoutMs: 80,
      userAssist: {
        autoAttemptMs: 20,
        reminderTimeoutMs: 300,
        pageTokenIntervalMs: 0,
        requestAssist,
        readPageToken: async () =>
          assisted ? "token-after-assist-reject" : null,
      },
    })

    expect(result).toMatchObject({
      status: "token_obtained",
      token: "token-after-assist-reject",
    })
    expect(requestAssist).toHaveBeenCalledTimes(1)
  })
})
