import { afterEach, describe, expect, it, vi } from "vitest"

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
  })

  it("shares concurrency state between legacy tasks and leases", async () => {
    vi.useFakeTimers()
    const { withSiteApiRequestLease, withSiteApiRequestLimit } = await import(
      "~/services/apiTransport/siteRequestLimiter"
    )
    const releases: Array<() => void> = []
    const startLegacyTask = () =>
      withSiteApiRequestLimit("https://example.invalid", async () => {
        await new Promise<void>((resolve) => {
          releases.push(resolve)
        })
      })
    const first = startLegacyTask()
    const second = startLegacyTask()
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
