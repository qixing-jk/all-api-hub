import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { waitForTurnstileToken } from "~/entrypoints/content/messageHandlers/utils/turnstileGuard"

describe("waitForTurnstileToken user assist", () => {
  beforeEach(() => {
    document.title = ""
    document.body.innerHTML = ""
    globalThis.__aahTurnstileAutoStartState = undefined
    globalThis.__aahTurnstilePreTriggerState = undefined
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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
        manualTimeoutMs: 400,
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
        manualTimeoutMs: 2_000,
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
        manualTimeoutMs: 1_000,
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
        manualTimeoutMs: 5_000,
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
        manualTimeoutMs: 900,
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
        manualTimeoutMs: 5_000,
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
        manualTimeoutMs: 5_000,
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
        manualTimeoutMs: 100,
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
        manualTimeoutMs: 300,
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
