import { afterEach, describe, expect, it, vi } from "vitest"

import {
  callOmniRoute,
  OmniRouteApiError,
} from "~/services/apiService/omniroute/request"

const input = {
  baseUrl: "https://gateway.invalid/",
  path: "api/providers",
  method: "POST" as const,
  token: "oma_test",
  body: { name: "Test" },
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("OmniRoute request failure evidence", () => {
  it("never dispatches an already cancelled write", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
    const signal = AbortSignal.abort()
    const error = await callOmniRoute({ ...input, options: { signal } }).catch(
      (error) => error,
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(error).toBeInstanceOf(OmniRouteApiError)
    expect(error).toMatchObject({
      dispatch: "not-dispatched",
      responseReceived: false,
      confirmedNonApplication: true,
      raw: signal.reason,
    })
  })

  it.each(["ECONNRESET", 42, 1.5, {}, undefined])(
    "preserves only usable operational codes: %j",
    async (code) => {
      const failure = Object.assign(new Error("socket closed"), { code })
      vi.spyOn(globalThis, "fetch").mockRejectedValue(failure)
      const error = await callOmniRoute(input).catch((error) => error)
      expect(error).toMatchObject({
        dispatch: "dispatched",
        responseReceived: false,
        confirmedNonApplication: false,
        raw: failure,
      })
      expect(error.code).toBe(
        typeof code === "string" || code === 42 ? code : undefined,
      )
    },
  )

  it.each([
    ["plain failure", "plain failure"],
    [{ detail: "problem detail" }, "problem detail"],
    [{ title: "problem title" }, "problem title"],
    [{ code: " NAME_CONFLICT " }, "OmniRoute request failed (409)"],
    [null, "OmniRoute request failed (409)"],
  ])(
    "reads framework errors without losing rejection certainty: %j",
    async (payload, message) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          typeof payload === "string" ? payload : JSON.stringify(payload),
          { status: 409 },
        ),
      )
      const error = await callOmniRoute(input).catch((error) => error)
      expect(error).toMatchObject({
        message,
        status: 409,
        confirmedNonApplication: true,
        raw: payload,
      })
      if (payload && typeof payload === "object" && "code" in payload)
        expect(error.code).toBe("NAME_CONFLICT")
    },
  )

  it("composes caller cancellation on browsers without AbortSignal.any or timeout and removes listeners", async () => {
    vi.spyOn(AbortSignal, "any", "get").mockReturnValue(undefined as never)
    vi.spyOn(AbortSignal, "timeout", "get").mockReturnValue(undefined as never)
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, "removeEventListener")
    let dispatchedSignal: AbortSignal | undefined
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      dispatchedSignal = init?.signal as AbortSignal
      controller.abort()
      throw new DOMException("Aborted", "AbortError")
    })
    await expect(
      callOmniRoute({ ...input, options: { signal: controller.signal } }),
    ).rejects.toMatchObject({
      dispatch: "dispatched",
      confirmedNonApplication: false,
    })
    expect(dispatchedSignal?.aborted).toBe(true)
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function))
  })

  it("supports already aborted caller signals on the fallback path", async () => {
    vi.spyOn(AbortSignal, "any", "get").mockReturnValue(undefined as never)
    const fetch = vi.spyOn(globalThis, "fetch")
    await expect(
      callOmniRoute({ ...input, options: { signal: AbortSignal.abort() } }),
    ).rejects.toMatchObject({ dispatch: "not-dispatched" })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("times out a dispatched request on the fallback path and clears its timer", async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, "timeout", "get").mockReturnValue(undefined as never)
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )
    const result = callOmniRoute({
      ...input,
      options: { timeoutMs: 20 },
    }).catch((error) => error)
    await vi.advanceTimersByTimeAsync(20)
    expect(await result).toMatchObject({
      dispatch: "dispatched",
      confirmedNonApplication: false,
    })
    expect(vi.getTimerCount()).toBe(0)
  })
})
