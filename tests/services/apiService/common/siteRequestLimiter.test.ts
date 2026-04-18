import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createSiteRequestLimiter } from "~/services/apiService/common/siteRequestLimiter"

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("createSiteRequestLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("limits concurrent work for the same site key", async () => {
    const limiter = createSiteRequestLimiter({
      maxConcurrentPerSite: 2,
      requestsPerMinute: 600,
      burst: 10,
    })

    const events: string[] = []
    const releases: Array<() => void> = []
    const createTask = (label: string) => async () => {
      events.push(`${label}:start`)
      await new Promise<void>((resolve) => {
        releases.push(resolve)
      })
      events.push(`${label}:end`)
    }

    const first = limiter("site-a", createTask("first"))
    const second = limiter("site-a", createTask("second"))
    const third = limiter("site-a", createTask("third"))

    await flushMicrotasks()
    expect(events).toEqual(["first:start", "second:start"])

    releases[0]?.()
    await first
    await flushMicrotasks()

    expect(events).toEqual([
      "first:start",
      "second:start",
      "first:end",
      "third:start",
    ])

    releases[1]?.()
    await second
    await flushMicrotasks()

    expect(events).toEqual([
      "first:start",
      "second:start",
      "first:end",
      "third:start",
      "second:end",
    ])

    releases[2]?.()
    await third
    expect(events).toEqual([
      "first:start",
      "second:start",
      "first:end",
      "third:start",
      "second:end",
      "third:end",
    ])
  })

  it("keeps FIFO order for queued same-site work", async () => {
    const limiter = createSiteRequestLimiter({
      maxConcurrentPerSite: 1,
      requestsPerMinute: 600,
      burst: 10,
    })

    const events: string[] = []
    const releases: Array<() => void> = []
    const createTask = (label: string) => async () => {
      events.push(`${label}:start`)
      await new Promise<void>((resolve) => {
        releases.push(resolve)
      })
      events.push(`${label}:end`)
    }

    const first = limiter("site-a", createTask("first"))
    const second = limiter("site-a", createTask("second"))
    const third = limiter("site-a", createTask("third"))

    await flushMicrotasks()
    expect(events).toEqual(["first:start"])

    releases[0]?.()
    await first
    await flushMicrotasks()
    expect(events).toEqual(["first:start", "first:end", "second:start"])

    releases[1]?.()
    await second
    await flushMicrotasks()
    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
      "third:start",
    ])

    releases[2]?.()
    await third
    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
      "third:start",
      "third:end",
    ])
  })

  it("does not block different site keys", async () => {
    const limiter = createSiteRequestLimiter({
      maxConcurrentPerSite: 1,
      requestsPerMinute: 60,
      burst: 1,
    })

    const events: string[] = []
    let releaseSiteA: (() => void) | undefined

    const first = limiter("site-a", async () => {
      events.push("site-a:start")
      await new Promise<void>((resolve) => {
        releaseSiteA = resolve
      })
      events.push("site-a:end")
    })
    const second = limiter("site-b", async () => {
      events.push("site-b:start")
    })

    await flushMicrotasks()
    expect(events).toEqual(["site-a:start", "site-b:start"])

    await second
    releaseSiteA?.()
    await first
    expect(events).toEqual(["site-a:start", "site-b:start", "site-a:end"])
  })

  it("waits for token refill after the configured burst is consumed", async () => {
    const limiter = createSiteRequestLimiter({
      maxConcurrentPerSite: 1,
      requestsPerMinute: 60,
      burst: 2,
    })
    const events: string[] = []

    await limiter("site-a", async () => {
      events.push("first")
    })
    await limiter("site-a", async () => {
      events.push("second")
    })

    const third = limiter("site-a", async () => {
      events.push("third")
    })

    await flushMicrotasks()
    expect(events).toEqual(["first", "second"])

    vi.advanceTimersByTime(999)
    await flushMicrotasks()
    expect(events).toEqual(["first", "second"])

    vi.advanceTimersByTime(1)
    await third
    expect(events).toEqual(["first", "second", "third"])
  })

  it("releases the concurrency slot when a task rejects", async () => {
    const limiter = createSiteRequestLimiter({
      maxConcurrentPerSite: 1,
      requestsPerMinute: 600,
      burst: 10,
    })
    const events: string[] = []

    const first = limiter("site-a", async () => {
      events.push("first:start")
      throw new Error("boom")
    })
    const second = limiter("site-a", async () => {
      events.push("second:start")
      return "ok"
    })

    await expect(first).rejects.toThrow("boom")
    await expect(second).resolves.toBe("ok")
    expect(events).toEqual(["first:start", "second:start"])
  })

  it("runs immediately when disabled or when the key is empty", async () => {
    const disabledLimiter = createSiteRequestLimiter({
      enabled: false,
      maxConcurrentPerSite: 1,
      requestsPerMinute: 1,
      burst: 1,
    })
    const enabledLimiter = createSiteRequestLimiter({
      maxConcurrentPerSite: 1,
      requestsPerMinute: 1,
      burst: 1,
    })

    await expect(
      disabledLimiter("site-a", async () => "disabled"),
    ).resolves.toBe("disabled")
    await expect(enabledLimiter("", async () => "empty-key")).resolves.toBe(
      "empty-key",
    )
  })

  it.each([
    ["maxConcurrentPerSite", Number.NaN],
    ["maxConcurrentPerSite", Number.POSITIVE_INFINITY],
    ["maxConcurrentPerSite", 0],
    ["burst", Number.NaN],
    ["burst", Number.POSITIVE_INFINITY],
    ["burst", 0],
    ["requestsPerMinute", Number.NaN],
    ["requestsPerMinute", Number.POSITIVE_INFINITY],
    ["requestsPerMinute", -1],
  ])("rejects malformed %s config values", (field, value) => {
    expect(() =>
      createSiteRequestLimiter({
        maxConcurrentPerSite: 1,
        requestsPerMinute: 1,
        burst: 1,
        [field]: value,
      }),
    ).toThrow(TypeError)
  })
})
