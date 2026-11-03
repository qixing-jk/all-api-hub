import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createTaskLease } from "~~/tests/test-utils/siteRequestLease"

vi.mock("~/utils/core/environment", () => ({
  isTestMode: () => false,
}))

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("production site request limiter wrappers", () => {
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each([200, 401, 500])(
    "does not pause for HTTP %s with Retry-After",
    async (status) => {
      vi.useFakeTimers()
      const { reportSiteRateLimitResponse, withSiteApiRequestTask } =
        await import("~/services/apiTransport/siteRequestLimiter")
      const url = `https://non-throttled-${status}.example.invalid/api/keys`
      const response = new Response("body", {
        status,
        headers: { "Retry-After": "60" },
      })
      reportSiteRateLimitResponse(url, response)
      await expect(
        withSiteApiRequestTask(url, async () => "done"),
      ).resolves.toBe("done")
      expect(response.bodyUsed).toBe(false)
    },
  )

  it("normalizes response feedback to the origin without consuming its body", async () => {
    vi.useFakeTimers()
    const { reportSiteRateLimitResponse, withSiteApiRequestTask } =
      await import("~/services/apiTransport/siteRequestLimiter")
    const response = new Response("rate limited", {
      status: 429,
      headers: { "Retry-After": "2" },
    })
    reportSiteRateLimitResponse(
      "https://response-feedback.example.invalid/api/write",
      response,
    )
    const task = vi.fn(async () => "done")
    const pending = withSiteApiRequestTask(
      "https://response-feedback.example.invalid/api/read",
      task,
    )
    await vi.advanceTimersByTimeAsync(1999)
    expect(task).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toBe("done")
    expect(task).toHaveBeenCalledTimes(1)
    expect(response.bodyUsed).toBe(false)
  })

  it("uses the conservative fallback for a mixed batch of ordinary and native requests", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const { withSiteApiRequestLease, withSiteApiRequestTask } = await import(
      "~/services/apiTransport/siteRequestLimiter"
    )
    const origin = "https://unknown-budget.example.invalid"
    const startedAt: number[] = []
    const siteTypes = [
      undefined,
      SITE_TYPES.UNKNOWN,
      SITE_TYPES.OPENROUTER,
      SITE_TYPES.NANOGPT,
      "unregistered-type",
    ]
    const work = Array.from({ length: 20 }, (_, index) => {
      const task = async () => {
        startedAt.push(Date.now())
        return "done"
      }
      const siteType = siteTypes[index % siteTypes.length]
      return index % 2 === 0
        ? withSiteApiRequestLease(
            origin,
            () => createTaskLease(task),
            undefined,
            undefined,
            siteType,
          )
        : withSiteApiRequestTask(
            `${origin}/api/${index}`,
            task,
            undefined,
            undefined,
            siteType,
          )
    })

    await vi.advanceTimersByTimeAsync(1999)
    expect(startedAt).toEqual([0, 0, 0, 0])
    await vi.advanceTimersByTimeAsync(1)
    expect(startedAt).toEqual([0, 0, 0, 0, 2000])
    await vi.advanceTimersByTimeAsync(30_000)
    await Promise.all(work)
    expect(startedAt).toHaveLength(20)
    expect(startedAt.at(-1)).toBe(32_000)
  })

  it("shares a native provider's 429 with ordinary requests without replaying its write", async () => {
    vi.useFakeTimers()
    const { callGptLoad } = await import(
      "~/services/apiService/gptLoad/request"
    )
    const { withSiteApiRequestLease } = await import(
      "~/services/apiTransport/siteRequestLimiter"
    )
    const origin = "https://native-feedback.example.invalid"
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { code: "RATE_LIMITED", message: "rate limited" },
          { status: 429, headers: { "Retry-After": "2" } },
        ),
      )
    vi.stubGlobal("fetch", fetch)
    await expect(
      callGptLoad({ baseUrl: origin, path: "/api/groups", method: "POST" }),
    ).rejects.toMatchObject({ status: 429, dispatch: "dispatched" })

    const task = vi.fn(async () => "ordinary")
    const ordinary = withSiteApiRequestLease(origin, () =>
      createTaskLease(task),
    )
    await vi.advanceTimersByTimeAsync(1999)
    expect(task).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await expect(ordinary).resolves.toBe("ordinary")
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("shares server cooldown between ordinary and native HTTP callers", async () => {
    vi.useFakeTimers()
    const {
      withSiteApiRequestLease,
      withSiteApiRequestTask,
      reportSiteRateLimit,
    } = await import("~/services/apiTransport/siteRequestLimiter")
    const url = "https://mixed-api.example.invalid"
    await withSiteApiRequestLease(
      url,
      () => createTaskLease(async () => "first"),
      undefined,
      undefined,
      SITE_TYPES.NEW_API,
    )
    reportSiteRateLimit(url, "2")
    const task = vi.fn(async () => "native")
    const native = withSiteApiRequestTask(
      `${url}/api/keys`,
      task,
      undefined,
      undefined,
      SITE_TYPES.NEW_API,
    )
    await vi.advanceTimersByTimeAsync(1999)
    expect(task).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await expect(native).resolves.toBe("native")
    expect(task).toHaveBeenCalledTimes(1)
  })

  it("shares concurrency state between leases until transport completion", async () => {
    vi.useFakeTimers()
    const { withSiteApiRequestLease } = await import(
      "~/services/apiTransport/siteRequestLimiter"
    )
    const releases: Array<() => void> = []
    const startTaskLease = () =>
      withSiteApiRequestLease("https://example.invalid", () =>
        createTaskLease(async () => {
          await new Promise<void>((resolve) => {
            releases.push(resolve)
          })
        }),
      )
    const first = startTaskLease()
    const second = startTaskLease()
    const leaseFactory = vi.fn(() => ({
      result: Promise.resolve("lease result"),
      completion: Promise.resolve(),
    }))

    await flushMicrotasks()
    const leased = withSiteApiRequestLease(
      "https://example.invalid",
      leaseFactory,
    )
    await flushMicrotasks()
    expect(leaseFactory).not.toHaveBeenCalled()

    releases[0]?.()
    await first
    await flushMicrotasks()
    expect(leaseFactory).toHaveBeenCalledTimes(1)
    await expect(leased).resolves.toBe("lease result")

    releases[1]?.()
    await second
  })
})
