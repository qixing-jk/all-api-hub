import { afterEach, describe, expect, it, vi } from "vitest"

import { readGptLoadFailureMessage } from "~/services/apiService/gptLoad/auth"
import { newGptLoadIdempotencyKey } from "~/services/apiService/gptLoad/idempotency"
import * as readers from "~/services/apiService/gptLoad/parsing"
import { toGptLoadSanitizedGroup } from "~/services/apiService/gptLoad/redaction"
import {
  callGptLoad,
  GptLoadApiError,
  readGptLoadErrorMessage,
} from "~/services/apiService/gptLoad/request"

const input = {
  baseUrl: "https://gateway.invalid",
  path: "api/check",
  method: "GET" as const,
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("gpt-load request lifecycle", () => {
  it("does not dispatch an already cancelled request", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()
    controller.abort()
    const error = await callGptLoad({
      ...input,
      options: { signal: controller.signal },
    }).catch((error) => error)
    expect(error).toMatchObject({
      dispatch: "not-dispatched",
      confirmedNonApplication: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(["cancel", "timeout"])(
    "supports runtimes without native signal composition (%s)",
    async (mode) => {
      vi.stubGlobal("AbortSignal", { any: undefined, timeout: undefined })
      const controller = new AbortController()
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal!.addEventListener(
                "abort",
                () =>
                  reject(
                    Object.assign(new Error("cancelled"), {
                      code: "ABORT_ERR",
                    }),
                  ),
                { once: true },
              )
              if (mode === "cancel") controller.abort()
            }),
        ),
      )
      const error = await callGptLoad({
        ...input,
        options: { signal: controller.signal, timeoutMs: 5 },
      }).catch((error) => error)
      expect(error).toMatchObject({
        dispatch: "dispatched",
        responseReceived: false,
        confirmedNonApplication: false,
        code: "ABORT_ERR",
      })
    },
  )

  it("cleans up composed fallback listeners on success and pre-abort", async () => {
    vi.stubGlobal("AbortSignal", { any: undefined, timeout: undefined })
    const controller = new AbortController()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("")))
    expect(
      await callGptLoad({ ...input, options: { signal: controller.signal } }),
    ).toBeUndefined()
    controller.abort()
    await expect(
      callGptLoad({ ...input, options: { signal: controller.signal } }),
    ).rejects.toBeInstanceOf(GptLoadApiError)
  })

  it("preserves plain responses and tolerates absent envelope data", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("plain"))
        .mockResolvedValueOnce(Response.json({ code: 0 }))
        .mockResolvedValueOnce(Response.json({ status: "ok" })),
    )
    expect(await callGptLoad(input)).toBe("plain")
    expect(await callGptLoad(input)).toBeUndefined()
    expect(await callGptLoad(input)).toEqual({ status: "ok" })
  })

  it("preserves network diagnostic codes and rejects malformed success envelopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce({ code: 123, message: "network" })
        .mockResolvedValueOnce(Response.json({ code: "FAILED" })),
    )
    await expect(callGptLoad(input)).rejects.toMatchObject({
      code: 123,
      dispatch: "dispatched",
    })
    await expect(callGptLoad(input)).rejects.toMatchObject({
      code: "FAILED",
      message: "gpt-load request failed",
      confirmedNonApplication: true,
    })
    expect(readGptLoadErrorMessage(null, "fallback")).toBe("fallback")
    expect(readGptLoadErrorMessage({ message: " " }, "fallback")).toBe(
      "fallback",
    )
    expect(readGptLoadFailureMessage(new GptLoadApiError("native"))).toBe(
      "native",
    )
    expect(readGptLoadFailureMessage({ message: "plain" })).toBe("plain")
  })
})

describe("gpt-load response boundaries", () => {
  it("ignores malformed collections and preserves valid bare arrays", () => {
    expect(readers.readGptLoadGroups(null)).toEqual([])
    expect(
      readers.readGptLoadGroups([
        null,
        { id: -1, name: "bad" },
        { id: 1, name: "good" },
      ]),
    ).toEqual([{ id: 1, name: "good" }])
    expect(readers.readGptLoadGroupModels([{ id: "a" }, { id: "" }])).toEqual([
      { id: "a" },
    ])
    expect(readers.readGptLoadGroupModels(null)).toEqual([])
    expect(readers.readGptLoadSession(null)).toBeNull()
    expect(readers.readGptLoadSession({})).toEqual({
      authenticated: false,
      principalType: null,
    })
    expect(
      toGptLoadSanitizedGroup(
        { id: 1, name: "A", channel_id: "openai", credentials: { total: 2 } },
        "sk-plain",
      ),
    ).toMatchObject({ credentialCount: 2, secretState: "available" })
    expect(
      toGptLoadSanitizedGroup(
        { id: 1, name: "A", channel_id: "openai", credentials: { total: 2 } },
        "****",
      ),
    ).toMatchObject({ secretState: "masked" })
  })

  it.each(["missing", "throws"])(
    "generates accepted UUIDs when crypto is unavailable (%s)",
    (mode) => {
      vi.stubGlobal(
        "crypto",
        mode === "missing"
          ? undefined
          : {
              getRandomValues: () => {
                throw new Error("unavailable")
              },
            },
      )
      expect(newGptLoadIdempotencyKey()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
    },
  )
})
