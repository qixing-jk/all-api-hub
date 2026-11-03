import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { withSiteApiRequestTask } from "~/services/apiTransport/siteRequestLimiter"

const queueState = vi.hoisted(() => ({ visits: 0 }))
beforeEach(() => {
  queueState.visits = 0
  vi.mocked(withSiteApiRequestTask).mockClear()
})

vi.mock("~/services/apiTransport/siteRequestLimiter", () => ({
  reportSiteRateLimitResponse: vi.fn(),
  withSiteApiRequestTask: vi.fn(
    async (
      _url: string,
      task: () => Promise<unknown>,
      signal?: AbortSignal,
    ) => {
      if (queueState.visits++ === 0)
        await new Promise((resolve) => setTimeout(resolve, 60_000))
      signal?.throwIfAborted()
      return task()
    },
  ),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it.each(
  ["catalog", "cliProxyApi", "magpie", "gptLoad"].flatMap((provider) => [
    { provider, stalled: false },
    { provider, stalled: true },
  ]),
)(
  "$provider preserves its post-admission timeout (stalled=$stalled)",
  async ({ provider, stalled }) => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController()
      setTimeout(
        () => controller.abort(new DOMException("timed out", "TimeoutError")),
        ms,
      )
      return controller.signal
    })
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      init?.signal?.throwIfAborted()
      if (stalled)
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          )
        })
      return Response.json({ status: "ok", data: [], success: true })
    })
    vi.stubGlobal("fetch", fetchMock)
    let pending: Promise<unknown>
    if (provider === "catalog") {
      const { fetchAIHubMixModelCatalog } = await import(
        "~/services/apiService/aihubmix/modelCatalog"
      )
      pending = fetchAIHubMixModelCatalog()
    } else if (provider === "cliProxyApi") {
      const { requestCliProxyApi } = await import(
        "~/services/apiService/cliProxyApi"
      )
      pending = requestCliProxyApi(
        { baseUrl: "https://queue.example", adminToken: "key" },
        "config",
      )
    } else if (provider === "magpie") {
      const { requestMagpie } = await import(
        "~/services/apiService/magpie/request"
      )
      pending = requestMagpie(
        { baseUrl: "https://queue.example", webKey: "key" },
        "/api/providers",
      )
    } else {
      const { callGptLoad } = await import(
        "~/services/apiService/gptLoad/request"
      )
      pending = callGptLoad({
        baseUrl: "https://queue.example",
        path: "/api/groups",
        method: "GET",
        expectsJson: false,
      })
    }
    const outcome = pending.then(
      () => "completed",
      (error) => error,
    )
    await vi.advanceTimersByTimeAsync(59_999)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_001)
    if (stalled) {
      expect(await outcome).toBeInstanceOf(Error)
      expect((await outcome).name).toBe(
        {
          catalog: "TimeoutError",
          cliProxyApi: "CliProxyApiError",
          magpie: "MagpieApiError",
          gptLoad: "GptLoadApiError",
        }[provider],
      )
    } else expect(await outcome).toBe("completed")
    expect(fetchMock).toHaveBeenCalled()
    expect(withSiteApiRequestTask).toHaveBeenCalled()
    expect(
      vi.mocked(withSiteApiRequestTask).mock.invocationCallOrder[0],
    ).toBeLessThan(fetchMock.mock.invocationCallOrder[0])
  },
)

it("Magpie retains one 30-second budget across login and management dispatch", async () => {
  vi.useFakeTimers()
  const { requestMagpie } = await import("~/services/apiService/magpie/request")
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => resolve(Response.json({ status: "ok", data: [] })),
            20_000,
          )
          init?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer)
              reject(init.signal?.reason)
            },
            { once: true },
          )
        }),
    ),
  )
  const pending = requestMagpie(
    { baseUrl: "https://shared-budget.example", webKey: "key" },
    "/api/providers",
  )
  let settled: string | undefined
  const outcome = pending.then(
    () => (settled = "completed"),
    () => (settled = "failed"),
  )
  await vi.advanceTimersByTimeAsync(89_999)
  expect(settled).toBeUndefined()
  await vi.advanceTimersByTimeAsync(1)
  expect(await outcome).toBe("failed")
})

it("joined Magpie callers retain the existing budget from shared login dispatch", async () => {
  vi.useFakeTimers()
  const { requestMagpie, withMagpieRequestSession } = await import(
    "~/services/apiService/magpie/request"
  )
  const config = withMagpieRequestSession(
    { baseUrl: "https://joined.example", webKey: "key" },
    new Map(),
  )
  vi.stubGlobal("navigator", {})
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    ),
  )
  const outcomes: string[] = []
  const first = requestMagpie(config, "/api/providers").catch(() =>
    outcomes.push("first"),
  )
  const joined = requestMagpie(config, "/api/providers").catch(() =>
    outcomes.push("joined"),
  )
  await vi.advanceTimersByTimeAsync(89_999)
  expect(outcomes).toEqual([])
  await vi.advanceTimersByTimeAsync(1)
  expect(outcomes).toEqual(["first", "joined"])
  await Promise.all([first, joined])
})
