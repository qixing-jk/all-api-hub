import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { requestCliProxyApi } from "~/services/apiService/cliProxyApi"

const config = { baseUrl: "http://localhost:8317", adminToken: "test-key" }

describe("CLIProxyAPI request deadlines", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each(["headers", "body"])("bounds stalled response %s", async (phase) => {
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options: RequestInit) => {
        signal = options.signal ?? undefined
        const pending = () =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => reject(signal?.reason), {
              once: true,
            })
          })
        return phase === "headers"
          ? pending()
          : Promise.resolve({ ok: true, json: pending })
      }),
    )
    const request = requestCliProxyApi(config, "openai-compatibility").catch(
      (error) => error,
    )
    await vi.advanceTimersByTimeAsync(30_000)
    expect(signal?.aborted).toBe(true)
    expect(await request).toMatchObject({
      message: "CLIProxyAPI request failed",
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("preserves caller cancellation and clears the deadline", async () => {
    const caller = new AbortController()
    const reason = new Error("caller cancelled")
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener(
              "abort",
              () => reject(options.signal?.reason),
              { once: true },
            )
          }),
      ),
    )
    const request = requestCliProxyApi(
      config,
      "openai-compatibility",
      "GET",
      undefined,
      { signal: caller.signal },
    ).catch((error) => error)
    caller.abort(reason)
    expect(await request).toBe(reason)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not dispatch a request already cancelled by its caller", async () => {
    const caller = new AbortController()
    caller.abort()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      requestCliProxyApi(config, "openai-compatibility", "GET", undefined, {
        signal: caller.signal,
      }),
    ).rejects.toBe(caller.signal.reason)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("clears the deadline after reading a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ status: "ok" })),
    )
    await expect(
      requestCliProxyApi(config, "openai-compatibility", "PATCH", {}),
    ).resolves.toEqual({ status: "ok" })
    expect(vi.getTimerCount()).toBe(0)
  })
})
