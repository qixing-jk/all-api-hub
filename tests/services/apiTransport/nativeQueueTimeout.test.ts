import { afterEach, beforeEach, expect, it, vi } from "vitest"

const queueState = vi.hoisted(() => ({ visits: 0 }))
beforeEach(() => {
  queueState.visits = 0
})

vi.mock("~/services/apiTransport/siteRequestLimiter", () => ({
  reportSiteRateLimitResponse: vi.fn(),
  withSiteApiRequestTask: async (
    _url: string,
    task: () => Promise<unknown>,
    signal?: AbortSignal,
  ) => {
    if (queueState.visits++ === 0)
      await new Promise((resolve) => setTimeout(resolve, 60_000))
    signal?.throwIfAborted()
    return task()
  },
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it.each(["catalog", "cliProxyApi", "magpie", "gptLoad"])(
  "%s starts its request timeout after queue admission",
  async (provider) => {
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
      () => "failed",
    )
    await vi.advanceTimersByTimeAsync(59_999)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_001)
    expect(await outcome).toBe("completed")
    expect(fetchMock).toHaveBeenCalled()
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
  const outcome = pending.then(
    () => "completed",
    () => "failed",
  )
  await vi.advanceTimersByTimeAsync(120_000)
  expect(await outcome).toBe("failed")
})
