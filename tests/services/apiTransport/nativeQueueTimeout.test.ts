import { afterEach, expect, it, vi } from "vitest"

vi.mock("~/services/apiTransport/siteRequestLimiter", () => ({
  reportSiteRateLimitResponse: vi.fn(),
  withSiteApiRequestTask: async (
    _url: string,
    task: () => Promise<unknown>,
    signal?: AbortSignal,
  ) => {
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
    await vi.advanceTimersByTimeAsync(120_000)
    expect(await outcome).toBe("completed")
    expect(fetchMock).toHaveBeenCalled()
  },
)
